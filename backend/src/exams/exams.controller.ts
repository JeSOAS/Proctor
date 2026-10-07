import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  Param,
  Query,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { AdminGuard } from '../common/admin.guard';
import { CurrentTeacher, CurrentTeacherData } from '../auth/current-teacher.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ExamsService } from './exams.service';

@Controller('exams')
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  // ---- Instructor endpoints (require a teacher login token) ----

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentTeacher() teacher: CurrentTeacherData, @Body() body: any) {
    return this.examsService.createExam(teacher.id, body ?? {});
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@CurrentTeacher() teacher: CurrentTeacherData) {
    return this.examsService.listExams(teacher.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  get(@CurrentTeacher() teacher: CurrentTeacherData, @Param('id') id: string) {
    return this.examsService.getExam(teacher.id, id);
  }

  @Get(':id/sessions')
  @UseGuards(JwtAuthGuard)
  sessions(@CurrentTeacher() teacher: CurrentTeacherData, @Param('id') id: string) {
    return this.examsService.listExamSessions(teacher.id, id);
  }

  @Get(':id/export')
  @UseGuards(JwtAuthGuard)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(
    @CurrentTeacher() teacher: CurrentTeacherData,
    @Param('id') id: string,
    @Query('view') view: string | undefined,
    @Query('tz') tz: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { filename, csv } = await this.examsService.exportCsv(teacher.id, id, view === 'summary' ? 'summary' : 'log', tz);
    // RFC 5987 so non-ASCII exam titles survive; plain fallback for old clients.
    res.set(
      'Content-Disposition',
      `attachment; filename="${filename.replace(/[^ -~]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    return csv;
  }

  @Post(':id/status')
  @UseGuards(JwtAuthGuard)
  setStatus(
    @CurrentTeacher() teacher: CurrentTeacherData,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.examsService.setStatus(teacher.id, id, body?.status);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentTeacher() teacher: CurrentTeacherData,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.examsService.updateExam(teacher.id, id, body ?? {});
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@CurrentTeacher() teacher: CurrentTeacherData, @Param('id') id: string) {
    return this.examsService.deleteExam(teacher.id, id);
  }

  // ---- System/dev: wipe everything (admin-token only) ----

  @Delete()
  @UseGuards(AdminGuard)
  clearAll() {
    return this.examsService.clearAll();
  }

  // ---- Student endpoint (open — the extension calls this unauthenticated) ----

  @Post(':code/register')
  register(
    @Param('code') code: string,
    @Body() body: any,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.examsService.register(code, body ?? {}, userAgent);
  }
}
