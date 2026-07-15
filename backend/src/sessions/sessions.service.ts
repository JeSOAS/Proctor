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
