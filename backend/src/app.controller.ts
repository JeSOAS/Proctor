import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

@Controller()
export class AppController {
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
