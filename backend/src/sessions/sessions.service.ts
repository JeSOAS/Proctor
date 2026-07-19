import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// An ACTIVE session whose last heartbeat is older than this is considered
// abandoned (browser closed / extension removed) and auto-marked ENDED.
// The extension heartbeats every 30s, so 90s = three missed beats.
const STALE_TIMEOUT_MS = 90_000;

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Student-facing (open — called by the extension, no auth) ----

  async endSession(id: string) {
    await this.ensureSessionExists(id);
    return this.prisma.studentSession.update({
      where: { id },
      data: { status: 'ENDED', endedAt: new Date() },
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
    return violations.map((v) => ({
      ...v,
      payload: v.payload ? JSON.parse(v.payload) : null,
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

  /// Mark ACTIVE sessions whose heartbeat has gone stale as ENDED. Called by the
  /// exams read paths so the instructor view reflects who is really live.
  async expireStale() {
    const cutoff = new Date(Date.now() - STALE_TIMEOUT_MS);
    const stale = await this.prisma.studentSession.findMany({
      where: { status: 'ACTIVE', lastSeenAt: { lt: cutoff } },
      select: { id: true, lastSeenAt: true },
    });
    for (const s of stale) {
      await this.prisma.studentSession.update({
        where: { id: s.id },
        data: { status: 'ENDED', endedAt: s.lastSeenAt },
      });
    }
  }

  // ---- helpers ----

  /// Bump lastSeenAt; 404 if the session doesn't exist OR is already ENDED, so
  /// the extension knows to re-register instead of writing into a closed session.
  private async touchSession(id: string) {
    const { count } = await this.prisma.studentSession.updateMany({
      where: { id, status: 'ACTIVE' },
      data: { lastSeenAt: new Date() },
    });
    if (count === 0) {
      throw new NotFoundException(`Session ${id} not found or already ended`);
    }
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
