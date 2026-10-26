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
import { SharedSet } from '../shares/shared-set.entity.ts';
import { User } from '../users/user.entity.ts';
import { Init1761400000000 } from './migrations/1761400000000-Init.ts';
import { SharedSets1761500000000 } from './migrations/1761500000000-SharedSets.ts';

export const ENTITIES = [
  User,
  AuthToken,
  LanguageEntity,
  SetEntity,
  FolderEntity,
  FolderSetEntity,
  WordEntity,
  RuleEntity,
  SharedSet,
];

/** Listed explicitly (no globs): ESM + file globs don't mix well. */
export const MIGRATIONS = [Init1761400000000, SharedSets1761500000000];

/** The schema is only changed by migrations, never by `synchronize`. */
export function typeOrmOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    migrationsRun: true,
    synchronize: false,
  };
}
