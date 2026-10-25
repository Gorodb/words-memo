import type { DataSourceOptions } from 'typeorm';
import { AuthToken } from '../auth/auth-token.entity.ts';
import {
  FolderEntity,
  FolderSetEntity,
  LanguageEntity,
  RuleEntity,
  SetEntity,
  WordEntity,
} from '../sync/entities/content.entities.ts';
import { User } from '../users/user.entity.ts';
import { Init1761400000000 } from './migrations/1761400000000-Init.ts';

export const ENTITIES = [
  User,
  AuthToken,
  LanguageEntity,
  SetEntity,
  FolderEntity,
  FolderSetEntity,
  WordEntity,
  RuleEntity,
];

/** Listed explicitly (no globs): ESM + file globs don't mix well. */
export const MIGRATIONS = [Init1761400000000];

/** The schema is only changed by migrations, never by `synchronize`. */
export function typeOrmOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    migrationsRun: true,
    // gen_random_uuid() is built into Postgres 13+, unlike uuid-ossp.
    uuidExtension: 'pgcrypto',
    synchronize: false,
  };
}
