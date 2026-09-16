import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
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
