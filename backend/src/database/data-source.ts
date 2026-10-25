import { existsSync } from 'node:fs';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { typeOrmOptions } from './typeorm.options.ts';

/** For the TypeORM CLI (`npm run migration:*`), which runs outside Nest. */
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is not set');
}

export default new DataSource(typeOrmOptions(url));
