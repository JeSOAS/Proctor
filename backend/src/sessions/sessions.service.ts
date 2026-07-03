import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// An ACTIVE session whose last heartbeat is older than this is considered
// abandoned (browser closed / extension removed) and auto-marked ENDED.
// The extension heartbeats every 30s, so 90s = three missed beats.
const STALE_TIMEOUT_MS = 90_000;

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  createSession(userAgent?: string) {
    return this.prisma.session.create({
      data: { userAgent },
    });
  }

  async listSessions() {
    await this.expireStaleSessions();
    return this.prisma.session.findMany({
      orderBy: { startedAt: 'desc' },
      include: { _count: { select: { violations: true } } },
    });
  }

  async endSession(id: string) {
    await this.ensureSessionExists(id);
    return this.prisma.session.update({
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

  /// Dev helper: wipe all sessions (violations cascade with them).
  async clearAll() {
    const { count } = await this.prisma.session.deleteMany({});
    return { deletedSessions: count };
  }

  private async expireStaleSessions() {
    const cutoff = new Date(Date.now() - STALE_TIMEOUT_MS);
    const stale = await this.prisma.session.findMany({
      where: { status: 'ACTIVE', lastSeenAt: { lt: cutoff } },
      select: { id: true, lastSeenAt: true },
    });
    for (const s of stale) {
      await this.prisma.session.update({
        where: { id: s.id },
        data: { status: 'ENDED', endedAt: s.lastSeenAt },
      });
    }
  }

  /// Bump lastSeenAt; 404 if the session doesn't exist OR is already ENDED.
  /// The 404 tells the extension its stored session is unusable, so it
  /// creates a fresh one instead of writing into a closed session.
  private async touchSession(id: string) {
    const { count } = await this.prisma.session.updateMany({
      where: { id, status: 'ACTIVE' },
      data: { lastSeenAt: new Date() },
    });
    if (count === 0) {
      throw new NotFoundException(`Session ${id} not found or already ended`);
    }
  }

  private async ensureSessionExists(id: string) {
    const session = await this.prisma.session.findUnique({ where: { id } });
    if (!session) {
      throw new NotFoundException(`Session ${id} not found`);
    }
  }
}
