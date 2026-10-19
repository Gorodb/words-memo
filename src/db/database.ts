import { open, type DB } from '@op-engineering/op-sqlite';
import { migrate } from './migrations';

let db: DB | null = null;

/** Opens the user database and applies pending migrations. Idempotent. */
export function initDatabase(): DB {
  if (!db) {
    const connection = open({ name: 'wordsLearning.db' });
    connection.executeSync('PRAGMA foreign_keys = ON');
    migrate(connection);
    db = connection;
  }
  return db;
}

export function getDb(): DB {
  if (!db) {
    throw new Error('Database is not initialized; call initDatabase() first');
  }
  return db;
}
