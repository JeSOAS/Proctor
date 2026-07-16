import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// An ACTIVE session whose last heartbeat is older than this is considered
// abandoned (browser closed / extension removed) and auto-marked ENDED.
// The extension heartbeats every 30s, so 90s = three missed beats.
const STALE_TIMEOUT_MS = 90_000;

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

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
        // SQLite has no Json column type — store as text, parse on read
        payload: input.payload != null ? JSON.stringify(input.payload) : null,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
      },
    });
  }

  async listViolations(sessionId: string) {
    await this.ensureSessionExists(sessionId);
    const violations = await this.prisma.violation.findMany({
      where: { sessionId },
      orderBy: { occurredAt: 'asc' },
    });
    return violations.map((v) => ({
      ...v,
      payload: v.payload ? JSON.parse(v.payload) : null,
    }));
  }

  // ---- Session / student-info CRUD (instructor; guarded in the controller) ----
  // "Create" is registration (POST /exams/:code/register). Student info
  // (studentName, studentId) lives on the session record, so these cover both.

  /// Read one session with its exam context and violation count.
  async getSession(id: string) {
    const session = await this.prisma.studentSession.findUnique({
      where: { id },
      include: {
        exam: { select: { id: true, title: true, joinCode: true } },
        _count: { select: { violations: true } },
      },
    });
    if (!session) throw new NotFoundException(`Session ${id} not found`);
    return session;
  }

  /// Update student info (name / id) and/or session status.
  async updateSession(
    id: string,
    input: { studentName?: string; studentId?: string; status?: string },
  ) {
    await this.ensureSessionExists(id);
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

  /// Delete one session and its violations (cascade).
  async deleteSession(id: string) {
    await this.ensureSessionExists(id);
    await this.prisma.studentSession.delete({ where: { id } });
    return { deleted: true };
  }

  /// Mark ACTIVE sessions whose heartbeat has gone stale as ENDED. Called by
  /// the exams read paths so the instructor view reflects who is really live.
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

  /// Bump lastSeenAt; 404 if the session doesn't exist OR is already ENDED.
  /// The 404 tells the extension its stored session is unusable, so it
  /// re-registers instead of writing into a closed session.
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
    if (!session) {
      throw new NotFoundException(`Session ${id} not found`);
    }
  }
}
