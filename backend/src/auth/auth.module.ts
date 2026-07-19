import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [
    JwtModule.register({
      // MUST be set in production. Dev fallback keeps local runs working.
      secret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
      signOptions: { expiresIn: '12h' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  // Exported so ExamsModule / SessionsModule / CoursesModule can guard routes.
  exports: [JwtAuthGuard, JwtModule],
})
export class AuthModule {}
