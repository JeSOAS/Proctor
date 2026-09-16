import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Compare student ids by digits only, so "u6530338", "6530338", and any stray
// formatting all correlate (the AU email is u<id>@au.edu).
const digitsOnly = (s?: string | null) => (s || '').replace(/\D/g, '');

// A Google Form's id tokens as they appear in URLs: the published form
// (/forms/d/e/<ID>/…) and the file id (/forms/d/<ID>/…).
function formTokens(url?: string | null): string[] {
  if (!url) return [];
  const out: string[] = [];
  const published = url.match(/\/forms\/d\/e\/([^/?#]+)/i);
  if (published) out.push(published[1]);
  const file = url.match(/\/forms\/d\/([^/?#]+)/i);
  if (file && file[1] !== 'e') out.push(file[1]);
  return out;
}

@Injectable()
export class WebhooksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a Google Forms submission reported by the Apps Script webhook.
   * Correlates the FORM to an exam via the exam's stored `examLink`, and the
   * STUDENT to a session via the (digits-only) student id, then writes an
   * authoritative EXAM_SUBMITTED event.
   */
  async recordFormSubmission(input: {
    formId?: string;
    publishedUrl?: string;
    studentId?: string;
    submittedAt?: string;
  }) {
    const tokens = [input.formId, ...formTokens(input.publishedUrl)].filter(Boolean) as string[];
    const student = digitsOnly(input.studentId);
    if (!tokens.length || !student) {
      return { matched: false, reason: 'missing form identifier or student id' };
    }

    // Which exam is this form? The teacher sets the exam link to the form URL.
    const exams = await this.prisma.exam.findMany({
      where: { examLink: { not: null } },
      select: { id: true, examLink: true },
    });
    const exam = exams.find((e) => e.examLink && tokens.some((t) => e.examLink!.includes(t)));
    if (!exam) return { matched: false, reason: 'no exam links to this form' };

    // Which student's session? Match by normalized student id.
    const sessions = await this.prisma.studentSession.findMany({
      where: { examId: exam.id },
      select: { id: true, studentId: true },
    });
    const session = sessions.find((s) => digitsOnly(s.studentId) === student);
    if (!session) return { matched: false, reason: 'no session for this student in the exam' };

    await this.prisma.violation.create({
      data: {
        sessionId: session.id,
        type: 'EXAM_SUBMITTED',
        url: input.publishedUrl || null,
        occurredAt: input.submittedAt ? new Date(input.submittedAt) : new Date(),
      },
    });
    return { matched: true, sessionId: session.id };
  }
}
