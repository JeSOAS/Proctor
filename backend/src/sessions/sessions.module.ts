import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService], // ExamsService reuses expireStale()
})
export class SessionsModule {}
