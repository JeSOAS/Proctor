import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SessionsService } from './sessions.service';

// Session lifecycle endpoints. Sessions are CREATED by registering into an
// exam (POST /exams/:code/register) — there is no anonymous session creation.
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

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
