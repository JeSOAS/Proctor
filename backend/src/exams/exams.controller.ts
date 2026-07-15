import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { ExamsService } from './exams.service';

@Controller('exams')
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  @Post()
  create(@Body() body: any) {
    return this.examsService.createExam(body ?? {});
  }

  @Get()
  list() {
    return this.examsService.listExams();
  }

  // Dev helper — wipe every exam, session and violation. Remove before release.
  @Delete()
  clearAll() {
    return this.examsService.clearAll();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.examsService.getExam(id);
  }

  @Get(':id/sessions')
  sessions(@Param('id') id: string) {
    return this.examsService.listExamSessions(id);
  }

  @Post(':id/status')
  setStatus(@Param('id') id: string, @Body() body: any) {
    return this.examsService.setStatus(id, body?.status);
  }

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
