import { Body, Controller, Delete, Get, Headers, Param, Post } from '@nestjs/common';
import { SessionsService } from './sessions.service';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  create(@Headers('user-agent') userAgent?: string) {
    return this.sessionsService.createSession(userAgent);
  }

  @Get()
  list() {
    return this.sessionsService.listSessions();
  }

  // Dev helper — wipe everything. Remove before any real deployment.
  @Delete()
  clearAll() {
    return this.sessionsService.clearAll();
  }

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
}
