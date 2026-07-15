import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ExamsModule } from './exams/exams.module';
import { PrismaModule } from './prisma/prisma.module';
import { SessionsModule } from './sessions/sessions.module';

@Module({
  imports: [PrismaModule, SessionsModule, ExamsModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
