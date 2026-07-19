import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
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

  @Post(':id/status')
  @UseGuards(JwtAuthGuard)
  setStatus(
    @CurrentTeacher() teacher: CurrentTeacherData,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.examsService.setStatus(teacher.id, id, body?.status);
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
