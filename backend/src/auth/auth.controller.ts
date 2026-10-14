import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminGuard } from '../common/admin.guard';
import { AuthService } from './auth.service';
import { CurrentTeacher, CurrentTeacherData } from './current-teacher.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Admin creates teacher accounts (x-admin-token). No open self-registration.
  @Post('register')
  @UseGuards(AdminGuard)
  register(@Body() body: any) {
    return this.authService.register(body ?? {});
  }

  // Stricter than the global limit: 5 attempts per minute per client IP, so a
  // password cannot be guessed at the global rate (about 10 tries a second).
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  login(@Body() body: any) {
    return this.authService.login(body ?? {});
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentTeacher() teacher: CurrentTeacherData) {
    return teacher;
  }
}
