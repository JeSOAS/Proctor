import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// In production the secrets must be set: without them the app would fall back
// to an insecure JWT signing key and leave the admin endpoints open.
function requireProductionSecrets() {
  if (process.env.NODE_ENV !== 'production') return;
  const missing = ['JWT_SECRET', 'ADMIN_TOKEN'].filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    throw new Error(`[Proctor] Missing required environment variable(s): ${missing.join(', ')}`);
  }
}

async function bootstrap() {
  requireProductionSecrets();
  const app = await NestFactory.create(AppModule);
  // Behind the Cloudflare tunnel — trust the proxy so req.ip reflects the
  // forwarded client (the throttler also reads CF-Connecting-IP directly).
  app.getHttpAdapter().getInstance().set('trust proxy', true);
  app.enableCors({
    origin: '*',
  });
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`[Proctor] Backend listening on http://localhost:${port}`);
}

bootstrap();
