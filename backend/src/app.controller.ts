import { Controller, Get, Redirect } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

@Controller()
export class AppController {
  // The bare domain has no page of its own — send people to the dashboard
  // instead of a "Cannot GET /" 404.
  @Get()
  @Redirect('/dashboard/', 302)
  root() {}

  @SkipThrottle() // uptime/deploy health polls must never be rate-limited
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'proctor-backend',
      timestamp: new Date().toISOString(),
    };
  }
}
