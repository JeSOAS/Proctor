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
import { ExamsService } from './exams.service';

@Controller('exams')
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  // ---- Instructor endpoints (require x-admin-token in production) ----

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() body: any) {
    return this.examsService.createExam(body ?? {});
  }

  @Get()
  @UseGuards(AdminGuard)
  list() {
    return this.examsService.listExams();
  }

  // Dev helper — wipe every exam, session and violation. Guarded so it can
  // never be triggered anonymously on the public server.
  @Delete()
  @UseGuards(AdminGuard)
  clearAll() {
    return this.examsService.clearAll();
  }

  @Get(':id')
  @UseGuards(AdminGuard)
  get(@Param('id') id: string) {
    return this.examsService.getExam(id);
  }

  @Get(':id/sessions')
  @UseGuards(AdminGuard)
  sessions(@Param('id') id: string) {
    return this.examsService.listExamSessions(id);
  }

  @Post(':id/status')
  @UseGuards(AdminGuard)
  setStatus(@Param('id') id: string, @Body() body: any) {
    return this.examsService.setStatus(id, body?.status);
  }

  // ---- Student endpoint (open — the extension calls this unauthenticated) ----

  // Student joins an exam with the code the instructor shared.
  @Post(':code/register')
  register(
    @Param('code') code: string,
    @Body() body: any,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.examsService.register(code, body ?? {}, userAgent);
  }
}
