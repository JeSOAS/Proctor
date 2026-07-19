import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentTeacher, CurrentTeacherData } from '../auth/current-teacher.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionsService } from './sessions.service';

// Sessions are CREATED by registering into an exam (POST /exams/:code/register).
// Student-facing endpoints (heartbeat, violations, end) are open — the extension
// calls them unauthenticated. Instructor reads/edits are scoped to the teacher
// who owns the session (via its exam's course).
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  // ---- Student-facing (open) ----

  @Post(':id/end')
  end(@Param('id') id: string) {
    return this.sessionsService.endSession(id);
  }

  @Post(':id/heartbeat')
  heartbeat(@Param('id') id: string) {
    return this.sessionsService.heartbeat(id);
  }

  @Post(':id/violations')
  addViolation(@Param('id') id: string, @Body() body: any) {
    return this.sessionsService.addViolation(id, body);
  }

  // ---- Instructor (teacher login token) ----

  @Get(':id/violations')
  @UseGuards(JwtAuthGuard)
  listViolations(
    @CurrentTeacher() teacher: CurrentTeacherData,
    @Param('id') id: string,
  ) {
    return this.sessionsService.listViolations(teacher.id, id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  get(@CurrentTeacher() teacher: CurrentTeacherData, @Param('id') id: string) {
    return this.sessionsService.getSession(teacher.id, id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentTeacher() teacher: CurrentTeacherData,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.sessionsService.updateSession(teacher.id, id, body ?? {});
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@CurrentTeacher() teacher: CurrentTeacherData, @Param('id') id: string) {
    return this.sessionsService.deleteSession(teacher.id, id);
  }
}
