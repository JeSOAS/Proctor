import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { SessionsModule } from './sessions/sessions.module';

@Module({
  imports: [PrismaModule, SessionsModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
