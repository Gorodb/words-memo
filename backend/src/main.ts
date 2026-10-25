import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.ts';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Our own limit below; the default (100 kB) is too small for a first sync.
    bodyParser: false,
  });
  app.useBodyParser('json', { limit: process.env.BODY_LIMIT ?? '50mb' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // The future website will call the same API from the browser.
  app.enableCors();
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}

void bootstrap();
