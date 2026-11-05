import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.ts';
import { requestContextMiddleware } from './events/request-context.ts';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Our own limit below; the default (100 kB) is too small for a first sync.
    bodyParser: false,
  });
  app.useBodyParser('json', { limit: process.env.BODY_LIMIT ?? '50mb' });
  // After the body parser: its stream events would lose the context.
  app.use(requestContextMiddleware);
  // Every response is live data. Without this the hosting's Apache (mod_expires)
  // adds a 2-day max-age, and the browser answers refetches from its cache.
  // mod_expires leaves responses that already have an Expires header alone.
  app.use(
    (
      _req: unknown,
      res: { setHeader(name: string, value: string): void },
      next: () => void,
    ) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Expires', '0');
      next();
    },
  );
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // The future website will call the same API from the browser.
  app.enableCors();
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}

void bootstrap();
