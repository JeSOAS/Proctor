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
    input: { courseId?: string; title?: string; maxWarnings?: number },
  ) {
    if (!input.title || !input.title.trim()) {
      throw new BadRequestException('"title" is required');
    }
    if (!input.courseId) {
      throw new BadRequestException('"courseId" is required');
    }
    // The course must belong to this teacher.
    const course = await this.prisma.course.findFirst({
      where: { id: input.courseId, teacherId },
      select: { id: true },
    });
    if (!course) throw new NotFoundException(`Course ${input.courseId} not found`);

    const joinCode = await this.generateUniqueCode();
    return this.prisma.exam.create({
      data: {
        title: input.title.trim(),
        joinCode,
        courseId: course.id,
        maxWarnings:
          typeof input.maxWarnings === 'number' ? input.maxWarnings : undefined,
      },
    });
  }

  listExams(teacherId: string) {
    return this.prisma.exam.findMany({
      where: { course: { teacherId } },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { sessions: true } },
        course: { select: { id: true, name: true, subject: true } },
      },
    });
  }

  async getExam(teacherId: string, id: string) {
    await this.sessions.expireStale();
    const exam = await this.prisma.exam.findFirst({
      where: { id, course: { teacherId } },
      include: {
        _count: { select: { sessions: true } },
        course: { select: { id: true, name: true, subject: true } },
      },
    });
    if (!exam) throw new NotFoundException(`Exam ${id} not found`);
    return exam;
  }

  async listExamSessions(teacherId: string, examId: string) {
    await this.getExam(teacherId, examId); // ownership check + stale expiry
    return this.prisma.studentSession.findMany({
      where: { examId },
      orderBy: { startedAt: 'asc' },
      include: { _count: { select: { violations: true } } },
    });
  }

  async setStatus(teacherId: string, id: string, status: string) {
    const allowed = ['DRAFT', 'OPEN', 'CLOSED'];
    if (!allowed.includes(status)) {
      throw new BadRequestException(`status must be one of ${allowed.join(', ')}`);
    }
    await this.getExam(teacherId, id); // ownership check
    return this.prisma.exam.update({ where: { id }, data: { status } });
  }

  async deleteExam(teacherId: string, id: string) {
    await this.getExam(teacherId, id); // ownership check
    await this.prisma.exam.delete({ where: { id } });
    return { deleted: true };
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

  /// System/dev helper: wipe ALL exams across all teachers (admin-token only).
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
