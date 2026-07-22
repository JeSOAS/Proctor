import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  create(teacherId: string, input: { name?: string; year?: string; section?: string }) {
    if (!input.name || !input.name.trim()) {
      throw new BadRequestException('"name" is required');
    }
    return this.prisma.course.create({
      data: {
        name: input.name.trim(),
        year: input.year?.trim() || null,
        section: input.section?.trim() || null,
        teacherId,
      },
    });
  }

  list(teacherId: string) {
    return this.prisma.course.findMany({
      where: { teacherId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { exams: true } } },
    });
  }

  async get(teacherId: string, id: string) {
    const course = await this.prisma.course.findFirst({
      where: { id, teacherId },
      include: { _count: { select: { exams: true } } },
    });
    if (!course) throw new NotFoundException(`Course ${id} not found`);
    return course;
  }

  async update(
    teacherId: string,
    id: string,
    input: { name?: string; year?: string; section?: string },
  ) {
    await this.get(teacherId, id); // ownership check
    const data: { name?: string; year?: string | null; section?: string | null } = {};
    if (input.name !== undefined) {
      if (!input.name.trim()) throw new BadRequestException('"name" cannot be empty');
      data.name = input.name.trim();
    }
    if (input.year !== undefined) data.year = input.year?.trim() || null;
    if (input.section !== undefined) data.section = input.section?.trim() || null;
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('nothing to update (name, year or section)');
    }
    return this.prisma.course.update({ where: { id }, data });
  }

  async remove(teacherId: string, id: string) {
    await this.get(teacherId, id); // ownership check
    await this.prisma.course.delete({ where: { id } });
    return { deleted: true };
  }
}
