import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { CoursesModule } from './courses/courses.module';
import { ExamsModule } from './exams/exams.module';
import { PrismaModule } from './prisma/prisma.module';
import { SessionsModule } from './sessions/sessions.module';

@Module({
  imports: [
    // Serve the built React dashboard at /dashboard. Build it with `npm run
    // build` in dashboard/ (outputs dashboard/dist). In Docker, DASHBOARD_DIST
    // points at where the built assets are copied.
    ServeStaticModule.forRoot({
      rootPath:
        process.env.DASHBOARD_DIST ||
        join(__dirname, '..', '..', 'dashboard', 'dist'),
      serveRoot: '/dashboard',
    }),
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
