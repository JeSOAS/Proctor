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
import { AdminGuard } from '../common/admin.guard';
import { SessionsService } from './sessions.service';

// Sessions are CREATED by registering into an exam (POST /exams/:code/register)
// — there is no anonymous session creation.
//
// Student-facing endpoints (heartbeat, violations, end) are open — the extension
// calls them unauthenticated. Instructor CRUD on a session/student (read one,
// update, delete) is admin-token guarded.
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

  @Get(':id/violations')
  listViolations(@Param('id') id: string) {
    return this.sessionsService.listViolations(id);
  }

  // ---- Instructor CRUD on a session / its student info (admin-token guarded) ----

  @Get(':id')
  @UseGuards(AdminGuard)
  get(@Param('id') id: string) {
    return this.sessionsService.getSession(id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(@Param('id') id: string, @Body() body: any) {
    return this.sessionsService.updateSession(id, body ?? {});
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.sessionsService.deleteSession(id);
  }
}
