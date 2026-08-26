import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { concerningIds } from '../common/concerning';

// The extension heartbeats every 30s. An ACTIVE session with no beat for this
// long is marked DISCONNECTED (heartbeats stopped — network drop / sleep /
// extension off / browser closed, indistinguishable from the server).
const STALE_TIMEOUT_MS = 90_000;
// A DISCONNECTED session can resume (same session) within this window; after it,
// the session is terminally ENDED and a return means a fresh join.
const RESUME_WINDOW_MS = 10 * 60_000;
// A disconnect gap at least this long counts as a real ("concerning") warning;
// shorter blips are recorded but not counted toward the limit.
const SIGNIFICANT_DISCONNECT_SEC = 180;

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Student-facing (open — called by the extension, no auth) ----

  /// Explicit "Leave exam" from the popup — a deliberate, terminal end.
  async endSession(id: string) {
    await this.ensureSessionExists(id);
    return this.prisma.studentSession.update({
      where: { id },
      data: { status: 'ENDED', endedAt: new Date(), endedReason: 'LEFT' },
    });
  }

  async heartbeat(id: string) {
    await this.touchSession(id);
    return { ok: true };
  }

  async addViolation(
    sessionId: string,
    input: { type?: string; url?: string; payload?: unknown; occurredAt?: string },
  ) {
    if (!input.type || typeof input.type !== 'string') {
      throw new BadRequestException('"type" is required');
    }
    await this.touchSession(sessionId);
    return this.prisma.violation.create({
      data: {
        sessionId,
        type: input.type,
        url: input.url,
        payload: input.payload != null ? JSON.stringify(input.payload) : null,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
      },
    });
  }

  // ---- Instructor (teacher-scoped via Session -> Exam -> Course -> Teacher) ----

  async listViolations(teacherId: string, sessionId: string) {
    await this.ensureOwned(teacherId, sessionId);
    const violations = await this.prisma.violation.findMany({
      where: { sessionId },
      orderBy: { occurredAt: 'asc' },
    });
    // Annotate each row with whether it actually counts as a warning, using the
    // same classifier as the count, so the dashboard can grey out benign
    // exam/login activity instead of showing it all in red.
    const concerning = concerningIds(violations);
    return violations.map((v) => ({
      ...v,
      payload: v.payload ? JSON.parse(v.payload) : null,
      concerning: concerning.has(v.id),
    }));
  }

  async getSession(teacherId: string, id: string) {
    const session = await this.prisma.studentSession.findFirst({
      where: { id, exam: { course: { teacherId } } },
      include: {
        exam: { select: { id: true, title: true, joinCode: true } },
        _count: { select: { violations: true } },
      },
    });
    if (!session) throw new NotFoundException(`Session ${id} not found`);
    return session;
  }

  async updateSession(
    teacherId: string,
    id: string,
    input: { studentName?: string; studentId?: string; status?: string },
  ) {
    await this.ensureOwned(teacherId, id);
    const data: {
      studentName?: string;
      studentId?: string | null;
      status?: string;
      endedAt?: Date | null;
    } = {};

    if (input.studentName !== undefined) {
      if (!input.studentName.trim()) {
        throw new BadRequestException('"studentName" cannot be empty');
      }
      data.studentName = input.studentName.trim();
    }
    if (input.studentId !== undefined) {
      data.studentId = input.studentId?.trim() || null;
    }
    if (input.status !== undefined) {
      const allowed = ['ACTIVE', 'ENDED', 'DISCONNECTED'];
      if (!allowed.includes(input.status)) {
        throw new BadRequestException(`status must be one of ${allowed.join(', ')}`);
      }
      data.status = input.status;
      data.endedAt = input.status === 'ENDED' ? new Date() : null;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('nothing to update (studentName, studentId or status)');
    }
    return this.prisma.studentSession.update({ where: { id }, data });
  }

  async deleteSession(teacherId: string, id: string) {
    await this.ensureOwned(teacherId, id);
    await this.prisma.studentSession.delete({ where: { id } });
    return { deleted: true };
  }

  /// Move sessions through the disconnect lifecycle. Called by the exams read
  /// paths so the instructor view reflects reality.
  ///   ACTIVE, no beat for STALE_TIMEOUT   -> DISCONNECTED (recording when)
  ///   DISCONNECTED past the resume window -> ENDED (reason TIMEOUT)
  async expireStale() {
    const now = Date.now();
    const staleCutoff = new Date(now - STALE_TIMEOUT_MS);
    const graceCutoff = new Date(now - RESUME_WINDOW_MS);

    const stale = await this.prisma.studentSession.findMany({
      where: { status: 'ACTIVE', lastSeenAt: { lt: staleCutoff } },
      select: { id: true, lastSeenAt: true },
    });
    for (const s of stale) {
      await this.prisma.studentSession.update({
        where: { id: s.id },
        data: { status: 'DISCONNECTED', disconnectedAt: s.lastSeenAt },
      });
    }

    await this.prisma.studentSession.updateMany({
      where: { status: 'DISCONNECTED', disconnectedAt: { lt: graceCutoff } },
      data: { status: 'ENDED', endedAt: new Date(), endedReason: 'TIMEOUT' },
    });
  }

  // ---- helpers ----

  /// Keep a session alive on heartbeat/violation.
  ///  - ACTIVE       -> bump lastSeenAt.
  ///  - DISCONNECTED -> resume it and record the gap (RECONNECT, or
  ///                    LONG_DISCONNECT if significant), so a brief drop doesn't
  ///                    split into a new session.
  ///  - ENDED / gone -> 404, so the extension re-registers (fresh join).
  private async touchSession(id: string) {
    const s = await this.prisma.studentSession.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        disconnectedAt: true,
        exam: { select: { disconnectGraceSec: true } },
      },
    });
    if (!s || s.status === 'ENDED') {
      throw new NotFoundException(`Session ${id} not found or already ended`);
    }
    const now = new Date();
    if (s.status === 'DISCONNECTED') {
      const gapSec = s.disconnectedAt
        ? Math.round((now.getTime() - s.disconnectedAt.getTime()) / 1000)
        : 0;
      const graceSec = s.exam?.disconnectGraceSec ?? SIGNIFICANT_DISCONNECT_SEC;
      const concerning = gapSec >= graceSec;
      await this.prisma.$transaction([
        this.prisma.studentSession.update({
          where: { id },
          data: { status: 'ACTIVE', lastSeenAt: now, disconnectedAt: null },
        }),
        this.prisma.violation.create({
          data: {
            sessionId: id,
            type: concerning ? 'LONG_DISCONNECT' : 'RECONNECT',
            payload: JSON.stringify({ seconds: gapSec }),
            occurredAt: s.disconnectedAt ?? now,
          },
        }),
      ]);
      return;
    }
    await this.prisma.studentSession.update({
      where: { id },
      data: { lastSeenAt: now },
    });
  }

  private async ensureSessionExists(id: string) {
    const session = await this.prisma.studentSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException(`Session ${id} not found`);
  }

  /// Ownership check for instructor actions: the session's exam's course must
  /// belong to this teacher, otherwise it's a 404 (indistinguishable from absent).
  private async ensureOwned(teacherId: string, id: string) {
    const session = await this.prisma.studentSession.findFirst({
      where: { id, exam: { course: { teacherId } } },
      select: { id: true },
    });
    if (!session) throw new NotFoundException(`Session ${id} not found`);
  }
}
