import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';
import { classify } from '../common/concerning';

// Join-code alphabet: no 0/O/1/I/L to avoid students mistyping the code.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

// Safeguard: an OPEN exam with no end time that has been open longer than this
// is auto-closed, so a forgotten exam can't stay open indefinitely.
const MAX_EXAM_OPEN_HOURS = 24;

// A student who opens the exam more than this after its scheduled start is
// flagged "started late" (a small grace absorbs clock skew / a slow first load).
const LATE_START_GRACE_MS = 60_000;

// Ownership is enforced through the chain Exam -> Course -> Teacher: every query
// filters by the teacher, so a teacher can only ever touch their own exams.
@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {}

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
        openedAt: new Date(),
      },
    });
  }

  async listExams(teacherId: string) {
    await this.closeExpiredExams();
    return this.prisma.exam.findMany({
      where: { course: { teacherId } },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { sessions: true } },
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
        _count: { select: { sessions: true } },
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
          select: { id: true, sessionId: true, type: true, url: true, occurredAt: true },
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
      const r = classify(bySession.get(s.id) ?? [], { examLink: exam.examLink });
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
        startedLate,
        finishedEarly,
      };
    });
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
      if (!exam.openedAt) data.openedAt = new Date();
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
    input: { studentName?: string; studentId?: string },
    userAgent?: string,
  ) {
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

    const session = await this.prisma.studentSession.create({
      data: {
        examId: exam.id,
        studentName: input.studentName.trim(),
        studentId: input.studentId?.trim() || null,
        userAgent,
      },
    });

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
  /// have been open with no end time for longer than MAX_EXAM_OPEN_HOURS. Called
  /// on the instructor read paths so the view reflects reality. Global + idempotent.
  private async closeExpiredExams() {
    const now = new Date();
    const safeguardCutoff = new Date(now.getTime() - MAX_EXAM_OPEN_HOURS * 3_600_000);
    await this.prisma.exam.updateMany({
      where: {
        status: 'OPEN',
        OR: [
          // its end time has passed
          { endsAt: { lt: now } },
          // no end time, no scheduled start, created > safeguard window ago
          { endsAt: null, startsAt: null, createdAt: { lt: safeguardCutoff } },
          // no end time, started > safeguard window ago (future-scheduled exams
          // are left alone until they actually start)
          { endsAt: null, startsAt: { lt: safeguardCutoff } },
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
