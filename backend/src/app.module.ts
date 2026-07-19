import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { CoursesModule } from './courses/courses.module';
import { ExamsModule } from './exams/exams.module';
import { PrismaModule } from './prisma/prisma.module';
import { SessionsModule } from './sessions/sessions.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    CoursesModule,
    SessionsModule,
    ExamsModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
