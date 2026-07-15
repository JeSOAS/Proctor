import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';

// Join-code alphabet: no 0/O/1/I/L to avoid students mistyping the code.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {}

  async createExam(input: { title?: string; maxWarnings?: number }) {
    if (!input.title || typeof input.title !== 'string' || !input.title.trim()) {
      throw new BadRequestException('"title" is required');
    }
    const joinCode = await this.generateUniqueCode();
    return this.prisma.exam.create({
      data: {
        title: input.title.trim(),
        joinCode,
        maxWarnings:
          typeof input.maxWarnings === 'number' ? input.maxWarnings : undefined,
      },
    });
  }

  listExams() {
    return this.prisma.exam.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { sessions: true } } },
    });
  }

  async getExam(id: string) {
    await this.sessions.expireStale();
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: { _count: { select: { sessions: true } } },
    });
    if (!exam) throw new NotFoundException(`Exam ${id} not found`);
    return exam;
  }

  async listExamSessions(examId: string) {
    await this.getExam(examId); // 404s if missing, and expires stale sessions
    return this.prisma.studentSession.findMany({
      where: { examId },
      orderBy: { startedAt: 'asc' },
      include: { _count: { select: { violations: true } } },
    });
  }

  async setStatus(id: string, status: string) {
    const allowed = ['DRAFT', 'OPEN', 'CLOSED'];
    if (!allowed.includes(status)) {
      throw new BadRequestException(`status must be one of ${allowed.join(', ')}`);
    }
    await this.getExam(id);
    return this.prisma.exam.update({ where: { id }, data: { status } });
  }

  /// Student registration — the Week 7 "register student sessions" flow.
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
    if (exam.status !== 'OPEN') {
      throw new ConflictException(`Exam "${exam.title}" is not open for registration`);
    }

    const session = await this.prisma.studentSession.create({
      data: {
        examId: exam.id,
        studentName: input.studentName.trim(),
        studentId: input.studentId?.trim() || null,
        userAgent,
      },
    });

    // The extension needs the session id (for reporting) plus exam context.
    return {
      sessionId: session.id,
      examId: exam.id,
      examTitle: exam.title,
      maxWarnings: exam.maxWarnings,
    };
  }

  /// Dev helper: wipe all exams (sessions + violations cascade).
  async clearAll() {
    const { count } = await this.prisma.exam.deleteMany({});
    return { deletedExams: count };
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
