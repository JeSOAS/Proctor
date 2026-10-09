import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';
import { classify } from '../common/concerning';
import { buildLogCsv, buildSummaryCsv } from './csv-export';

// Join-code alphabet: no 0/O/1/I/L to avoid students mistyping the code.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

// Safeguard: an OPEN exam with no end time that has been open (since it was
// opened or last reopened) longer than this
// is auto-closed, so a forgotten exam can't stay open indefinitely.
const MAX_EXAM_OPEN_HOURS = 24;

// A student who opens the exam more than this after its scheduled start is
// flagged "started late" (a small grace absorbs clock skew / a slow first load).
const LATE_START_GRACE_MS = 60_000;

// The read paths run housekeeping (auto-close expired exams, end their sessions)
// on every request. With the dashboard polling every ~5s that's wasteful, so it
// runs at most this often; a few seconds' lag in auto-expiry is harmless.
const MAINTENANCE_THROTTLE_MS = 15_000;

// Scheduled exams must close at their end time even if nobody has the dashboard
// open (in the 17 Sep trial an exam ending 10:00 only closed at 11:16, when the
// instructor next looked, and students kept being monitored). A server timer
// runs the same expiry sweep, so exams close within this much of endsAt.
const EXPIRY_SWEEP_MS = 30_000;

// A session counts as "live" (someone is in it right now) if it heartbeated this
// recently — the same 90 s after which it is treated as disconnected.
const LIVE_SESSION_MS = 90_000;

// endedReason of a row created by the form webhook for a submission whose
// student ID matches no session (see webhooks.service). Not a real join.
export const NO_SESSION = 'NO_SESSION';
const NOT_PLACEHOLDER = { OR: [{ endedReason: null }, { endedReason: { not: NO_SESSION } }] };

// Extension version gate: MIN_EXTENSION_VERSION (env, e.g. "1.2.2") refuses joins
// from older extensions with instructions to update. Unset = no gate. Versions
// before 1.2.2 send no version at all and are treated as older.
const versionParts = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0);
function olderThan(v: string, min: string): boolean {
  const a = versionParts(v), b = versionParts(min);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}
// The stored user agent carries " Proctor/<version>"; compare browsers without it.
const baseUa = (ua?: string | null) => (ua || '').replace(/ Proctor\/[\d.]+$/, '');

// Names are compared loosely (case, spacing) so "john  smith" == "John Smith".
const sameName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

// Ownership is enforced through the chain Exam -> Course -> Teacher: every query
// filters by the teacher, so a teacher can only ever touch their own exams.
@Injectable()
export class ExamsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExamsService.name);
  private sweepTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {}

  onModuleInit() {
    this.sweepTimer = setInterval(() => {
      this.closeExpiredExams().catch((e) => this.logger.warn(`expiry sweep failed: ${e?.message ?? e}`));
    }, EXPIRY_SWEEP_MS);
    this.sweepTimer.unref(); // never keep the process alive just for the timer
  }

  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  async createExam(
    teacherId: string,
    input: {
      courseId?: string;
      title?: string;
      maxWarnings?: number;
      startsAt?: string;
      endsAt?: string;
      expectedStudents?: number;
      examLink?: string;
    },
  ) {
    if (!input.title || !input.title.trim()) {
      throw new BadRequestException('"title" is required');
    }
    if (!input.courseId) {
      throw new BadRequestException('"courseId" is required');
    }
    const course = await this.prisma.course.findFirst({
      where: { id: input.courseId, teacherId },
      select: { id: true },
    });
    if (!course) throw new NotFoundException(`Course ${input.courseId} not found`);

    const startsAt = this.parseDate(input.startsAt, 'startsAt');
    const endsAt = this.parseDate(input.endsAt, 'endsAt');
    if (startsAt && endsAt && endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }

    const joinCode = await this.generateUniqueCode();
    return this.prisma.exam.create({
      data: {
        title: input.title.trim(),
        joinCode,
        courseId: course.id,
        maxWarnings:
          typeof input.maxWarnings === 'number' ? input.maxWarnings : undefined,
        expectedStudents: this.parseExpected(input.expectedStudents),
        examLink: input.examLink?.trim() || null,
        startsAt,
        endsAt,
        // A future-scheduled exam hasn't actually opened yet — its "actual"
        // open time is set when it truly opens (first student joins, below).
        openedAt: startsAt && startsAt > new Date() ? null : new Date(),
      },
    });
  }

  async listExams(teacherId: string) {
    await this.closeExpiredExams();
    return this.prisma.exam.findMany({
      where: { course: { teacherId } },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { sessions: { where: NOT_PLACEHOLDER } } },
        course: { select: { id: true, name: true, year: true, section: true } },
      },
    });
  }

  async getExam(teacherId: string, id: string) {
    await this.closeExpiredExams();
    await this.sessions.expireStale();
    const exam = await this.prisma.exam.findFirst({
      where: { id, course: { teacherId } },
      include: {
        _count: { select: { sessions: { where: NOT_PLACEHOLDER } } },
        course: { select: { id: true, name: true, year: true, section: true } },
      },
    });
    if (!exam) throw new NotFoundException(`Exam ${id} not found`);
    return exam;
  }

  async listExamSessions(teacherId: string, examId: string) {
    const exam = await this.getExam(teacherId, examId); // ownership check + stale expiry
    const sessions = await this.prisma.studentSession.findMany({
      where: { examId },
      orderBy: { startedAt: 'asc' },
      include: { _count: { select: { violations: true } } },
    });
    // Per-session signals, computed at read time from the events (in time
    // order) — see common/concerning.ts. The raw log is never altered.
    //   concerningCount — warnings, after filtering benign exam/login activity
    //   aiUsed          — visited a known AI tool
    //   didNotOpenExam  — an exam link is set but this session never touched it
    const ids = sessions.map((s) => s.id);
    const events = ids.length
      ? await this.prisma.violation.findMany({
          where: { sessionId: { in: ids } },
          select: { id: true, sessionId: true, type: true, url: true, payload: true, occurredAt: true },
          orderBy: { occurredAt: 'asc' },
        })
      : [];
    const bySession = new Map<string, typeof events>();
    for (const e of events) {
      const list = bySession.get(e.sessionId);
      if (list) list.push(e);
      else bySession.set(e.sessionId, [e]);
    }
    return sessions.map((s) => {
      const r = classify(bySession.get(s.id) ?? [], { examLink: exam.examLink, awayGraceSec: exam.awayGraceSec });
      const startedLate =
        !!exam.startsAt &&
        !!r.examStartedAt &&
        r.examStartedAt.getTime() > exam.startsAt.getTime() + LATE_START_GRACE_MS;
      const finishedEarly =
        !!exam.endsAt && !!r.submittedAt && r.submittedAt.getTime() < exam.endsAt.getTime();
      return {
        ...s,
        concerningCount: r.concerning.size,
        aiUsed: r.aiUsed,
        didNotOpenExam: !!exam.examLink && !r.visitedExamLink,
        examStartedAt: r.examStartedAt,
        submittedAt: r.submittedAt,
        submissionConfirmed: r.submissionConfirmed,
        startedLate,
        finishedEarly,
        idle: r.idle,
        reconnectCount: r.reconnectCount,
        frequentReconnect: r.reconnectCount > 2,
        tamperIntent: r.tamperIntent,
        unaccountedSec: r.unaccountedSec,
        idConflict: (bySession.get(s.id) ?? []).some((e) => e.type === 'ID_CONFLICT'),
        nameMismatch: (bySession.get(s.id) ?? []).some((e) => e.type === 'NAME_MISMATCH'),
        submittedWithoutJoining: s.endedReason === NO_SESSION,
      };
    });
  }

  /// CSV exports, formatted like the dashboard (see csv-export.ts):
  ///   view "summary" — one row per student with counts, assessment and flags;
  ///   view "log"     — every event as a readable row, framed by joined/ended.
  /// Times are written in the teacher's time zone (`tz`, from the browser).
  async exportCsv(teacherId: string, examId: string, view: string, tz?: string) {
    const exam = await this.getExam(teacherId, examId); // ownership check
    const base = (exam.title || 'exam').replace(/[\\/:*?"<>|]/g, '_');
    if (view === 'summary') {
      const rows = await this.listExamSessions(teacherId, examId);
      return { filename: `${base} - summary.csv`, csv: buildSummaryCsv(rows, exam.maxWarnings, tz) };
    }
    const sessions = await this.prisma.studentSession.findMany({
      where: { examId },
      orderBy: { startedAt: 'asc' },
      include: { violations: { orderBy: { occurredAt: 'asc' } } },
    });
    return { filename: `${base} - full log.csv`, csv: buildLogCsv(sessions, { examLink: exam.examLink, awayGraceSec: exam.awayGraceSec }, tz) };
  }

  async setStatus(teacherId: string, id: string, status: string) {
    const allowed = ['DRAFT', 'OPEN', 'CLOSED'];
    if (!allowed.includes(status)) {
      throw new BadRequestException(`status must be one of ${allowed.join(', ')}`);
    }
    const exam = await this.getExam(teacherId, id); // ownership check
    const data: { status: string; openedAt?: Date; closedAt?: Date | null } = { status };
    if (status === 'OPEN') {
      data.closedAt = null; // reopened
      // Reopening an exam with no end time starts a fresh open period, so the
      // 24 h safeguard (counted from openedAt) doesn't close it again at once.
      if (!exam.openedAt || (exam.status === 'CLOSED' && !exam.endsAt)) data.openedAt = new Date();
    }
    if (status === 'CLOSED') data.closedAt = new Date();
    const updated = await this.prisma.exam.update({ where: { id }, data });
    // Closing an exam ends any still-running sessions, so lingering tabs stop
    // logging events after the exam is over.
    if (status === 'CLOSED') await this.endSessionsOfClosedExams();
    return updated;
  }

  async deleteExam(teacherId: string, id: string) {
    await this.getExam(teacherId, id); // ownership check
    await this.prisma.exam.delete({ where: { id } });
    return { deleted: true };
  }

  /// Update exam settings (advanced panel).
  async updateExam(
    teacherId: string,
    id: string,
    input: {
      maxWarnings?: number;
      disconnectGraceSec?: number;
      awayGraceSec?: number;
      autoClose?: boolean;
      notifyStudent?: boolean;
      expectedStudents?: number;
      examLink?: string;
    },
  ) {
    await this.getExam(teacherId, id); // ownership check
    const data: {
      maxWarnings?: number;
      disconnectGraceSec?: number;
      awayGraceSec?: number;
      autoClose?: boolean;
      notifyStudent?: boolean;
      expectedStudents?: number | null;
      examLink?: string | null;
    } = {};
    if (typeof input.maxWarnings === 'number') {
      if (input.maxWarnings < 1) throw new BadRequestException('maxWarnings must be at least 1');
      data.maxWarnings = Math.floor(input.maxWarnings);
    }
    if (input.expectedStudents !== undefined) {
      data.expectedStudents = this.parseExpected(input.expectedStudents);
    }
    if (input.examLink !== undefined) data.examLink = input.examLink?.trim() || null;
    if (typeof input.disconnectGraceSec === 'number') {
      if (input.disconnectGraceSec < 0) {
        throw new BadRequestException('disconnectGraceSec must be >= 0');
      }
      data.disconnectGraceSec = Math.floor(input.disconnectGraceSec);
    }
    if (typeof input.awayGraceSec === 'number') {
      if (input.awayGraceSec < 0 || input.awayGraceSec > 3600) {
        throw new BadRequestException('awayGraceSec must be between 0 and 3600');
      }
      data.awayGraceSec = Math.floor(input.awayGraceSec);
    }
    if (typeof input.autoClose === 'boolean') data.autoClose = input.autoClose;
    if (typeof input.notifyStudent === 'boolean') data.notifyStudent = input.notifyStudent;
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('nothing to update');
    }
    return this.prisma.exam.update({ where: { id }, data });
  }

  /// Student registration (open — the extension calls this, no teacher auth).
  async register(
    joinCode: string,
    input: { studentName?: string; studentId?: string; extensionVersion?: string },
    browserAgent?: string,
  ) {
    const version = typeof input.extensionVersion === 'string' ? input.extensionVersion.trim() : '';
    const minVersion = process.env.MIN_EXTENSION_VERSION?.trim();
    if (minVersion && (!version || olderThan(version, minVersion))) {
      throw new HttpException(
        {
          statusCode: 426,
          error: 'Upgrade Required',
          message:
            `Your Proctor extension is out of date${version ? ` (version ${version})` : ''}. ` +
            `Version ${minVersion} or newer is required: close all Chrome windows and reopen Chrome ` +
            'so it can update, then join again.',
        },
        426,
      );
    }
    // Shown to the teacher on the dashboard (which extension version joined).
    const userAgent = version ? `${browserAgent ?? ''} Proctor/${version}`.trim() : browserAgent;
    if (!input.studentName || !input.studentName.trim()) {
      throw new BadRequestException('"studentName" is required');
    }
    const exam = await this.prisma.exam.findUnique({
      where: { joinCode: joinCode.toUpperCase() },
    });
    if (!exam) throw new NotFoundException(`No exam for code ${joinCode}`);

    // Enforce the exam window: refuse before it starts, after it ends, or if it
    // isn't OPEN. Auto-close it if its end time has passed.
    const now = new Date();
    const notStarted = !!exam.startsAt && now < exam.startsAt;
    const timedOut = !!exam.endsAt && exam.endsAt < now;
    if (exam.status !== 'OPEN' || notStarted || timedOut) {
      if (exam.status === 'OPEN' && timedOut) {
        await this.prisma.exam.update({
          where: { id: exam.id },
          data: { status: 'CLOSED', closedAt: now },
        });
      }
      const reason = notStarted ? 'has not started yet' : 'is not open for registration';
      throw new ConflictException(`Exam "${exam.title}" ${reason}`);
    }

    // First successful join = when the exam actually opened (for scheduled
    // exams that had no open time yet).
    if (!exam.openedAt) {
      await this.prisma.exam.update({ where: { id: exam.id }, data: { openedAt: now } });
    }

    // One session per student per exam: if this student already has a session
    // for this exam, reuse it instead of creating a duplicate row when they
    // re-join (after a Leave, a timeout, or just re-entering the code). Match on
    // student ID when given (robust — same person even if they retype the name),
    // otherwise on name.
    const studentName = input.studentName.trim();
    const studentId = input.studentId?.trim() || null;
    const existing = await this.prisma.studentSession.findFirst({
      where: studentId
        ? { examId: exam.id, studentId }
        : { examId: exam.id, studentName },
      orderBy: { startedAt: 'desc' },
    });

    let session;
    if (existing) {
      const wasEnded = existing.status === 'ENDED';
      // A row the webhook created for a submission without a session: the real
      // student has now joined, so it simply becomes theirs.
      const placeholder = existing.endedReason === NO_SESSION;
      const nameDiffers = !placeholder && sameName(existing.studentName) !== sameName(studentName);

      // The student ID is typed, not verified. If it belongs to a session that is
      // live right now and the joiner looks like someone else (different name or
      // browser), refuse instead of merging two students into one record, and
      // leave a trace on the existing session for the instructor.
      const live =
        existing.status === 'ACTIVE' && now.getTime() - existing.lastSeenAt.getTime() < LIVE_SESSION_MS;
      if (live && (nameDiffers || (existing.userAgent && userAgent && baseUa(existing.userAgent) !== baseUa(userAgent)))) {
        await this.prisma.violation.create({
          data: {
            sessionId: existing.id,
            type: 'ID_CONFLICT',
            payload: JSON.stringify({ attemptedName: studentName }),
            occurredAt: now,
          },
        });
        throw new ConflictException(
          'This student ID is already being used in this exam. Check your student ID, or ask your instructor.',
        );
      }

      session = await this.prisma.studentSession.update({
        where: { id: existing.id },
        data: {
          status: 'ACTIVE',
          lastSeenAt: now,
          disconnectedAt: null,
          endedAt: null,
          endedReason: null,
          // Keep the name from the first join (a different one is flagged below);
          // only a webhook placeholder row takes the newly typed name.
          studentName: placeholder ? studentName : existing.studentName,
          studentId: studentId ?? existing.studentId,
          userAgent,
        },
      });
      if (nameDiffers) {
        await this.prisma.violation.create({
          data: {
            sessionId: existing.id,
            type: 'NAME_MISMATCH',
            payload: JSON.stringify({ typedName: studentName }),
            occurredAt: now,
          },
        });
      }
      // Record the re-join in the timeline so the reopened session still shows
      // that the student left and came back.
      if (wasEnded && !placeholder) {
        await this.prisma.violation.create({
          data: { sessionId: existing.id, type: 'REJOIN', occurredAt: now },
        });
      }
    } else {
      session = await this.prisma.studentSession.create({
        data: { examId: exam.id, studentName, studentId, userAgent },
      });
    }

    return {
      sessionId: session.id,
      examId: exam.id,
      examTitle: exam.title,
      maxWarnings: exam.maxWarnings,
      notifyStudent: exam.notifyStudent,
      // The extension uses this to detect exam start (first visit) and to know
      // the form domain; it's auto-whitelisted server-side too.
      examLink: exam.examLink,
    };
  }

  /// System/dev helper: wipe ALL exams across all teachers (admin-token only).
  async clearAll() {
    const { count } = await this.prisma.exam.deleteMany({});
    return { deletedExams: count };
  }

  /// Auto-close OPEN exams whose end time has passed, or (as a safeguard) that
  /// have been open with no end time for longer than MAX_EXAM_OPEN_HOURS. Runs on
  /// a server timer (EXPIRY_SWEEP_MS) and on the instructor read paths. Global + idempotent.
  private lastExpiryRun = 0;
  private async closeExpiredExams() {
    if (Date.now() - this.lastExpiryRun < MAINTENANCE_THROTTLE_MS) return;
    this.lastExpiryRun = Date.now();
    const now = new Date();
    const safeguardCutoff = new Date(now.getTime() - MAX_EXAM_OPEN_HOURS * 3_600_000);
    await this.prisma.exam.updateMany({
      where: {
        status: 'OPEN',
        OR: [
          // its end time has passed
          { endsAt: { lt: now } },
          // no end time, opened (or reopened) > safeguard window ago
          { endsAt: null, openedAt: { lt: safeguardCutoff } },
          // never opened yet: fall back to the scheduled start, else creation
          // (future-scheduled exams are left alone until they actually start)
          { endsAt: null, openedAt: null, startsAt: { lt: safeguardCutoff } },
          { endsAt: null, openedAt: null, startsAt: null, createdAt: { lt: safeguardCutoff } },
        ],
      },
      data: { status: 'CLOSED', closedAt: now },
    });
    // Any exam that just auto-closed leaves sessions running — end them too.
    await this.endSessionsOfClosedExams();
  }

  /// End (mark ENDED, reason EXAM_CLOSED) every still-running session that
  /// belongs to a CLOSED exam. Idempotent — only touches non-ENDED sessions —
  /// so it's cheap to call on read paths and stops lingering tabs from logging.
  private async endSessionsOfClosedExams() {
    await this.prisma.studentSession.updateMany({
      where: { status: { not: 'ENDED' }, exam: { status: 'CLOSED' } },
      data: { status: 'ENDED', endedReason: 'EXAM_CLOSED', endedAt: new Date() },
    });
  }

  private parseExpected(value: number | undefined): number | null {
    if (value === undefined || value === null) return null;
    const n = Math.floor(Number(value));
    if (isNaN(n) || n < 0) throw new BadRequestException('expectedStudents must be >= 0');
    return n;
  }

  private parseDate(value: string | undefined, field: string): Date | null {
    if (!value) return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) throw new BadRequestException(`invalid ${field}`);
    return d;
  }

  private async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      const existing = await this.prisma.exam.findUnique({ where: { joinCode: code } });
      if (!existing) return code;
    }
    throw new ConflictException('Could not generate a unique join code, try again');
  }
}
