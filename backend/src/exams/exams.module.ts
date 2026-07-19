import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SessionsModule } from '../sessions/sessions.module';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';

@Module({
  imports: [SessionsModule, AuthModule], // SessionsService + JwtAuthGuard
  controllers: [ExamsController],
  providers: [ExamsService],
})
export class ExamsModule {}
