import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [AuthModule], // JwtAuthGuard for instructor endpoints
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService], // ExamsService reuses expireStale()
})
export class SessionsModule {}
