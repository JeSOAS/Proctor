import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { RealIpThrottlerGuard } from './common/real-ip-throttler.guard';
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
      serveStaticOptions: {
        // Vite content-hashes everything under assets/ (the filename changes
        // whenever the content does), so those files can be cached forever —
        // repeat dashboard loads then skip re-downloading the JS/CSS entirely.
        // index.html and other unhashed files must stay fresh, or a new deploy
        // would never reach a returning browser.
        setHeaders: (res, filePath) => {
          if (/[\\/]assets[\\/]/.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      },
    }),
    // Abuse protection on the open student endpoints (register / heartbeat /
    // violations are unauthenticated). A short-window burst limit per real
    // client IP: stops a script hammering the API without affecting a real
    // student (who sends only a few requests a minute). Tunable via env.
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL_MS ?? 10_000),
        limit: Number(process.env.THROTTLE_LIMIT ?? 100),
      },
    ]),
    PrismaModule,
    AuthModule,
    CoursesModule,
    SessionsModule,
    ExamsModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: RealIpThrottlerGuard }],
})
export class AppModule {}
