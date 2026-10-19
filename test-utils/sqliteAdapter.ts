/**
 * The subset of the op-sqlite DB API the app uses, implemented on Node's
 * built-in SQLite so tests run the real migrations and repository SQL.
 */
export function openNodeSqlite() {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  const executeSync = (query: string, params: unknown[] = []) => ({
    rows: db.prepare(query).all(...params),
    rowsAffected: 0,
  });
  const execute = async (query: string, params?: unknown[]) =>
    executeSync(query, params);
  return {
    executeSync,
    execute,
    transaction: async (fn: (tx: { execute: typeof execute }) => Promise<void>) => {
      executeSync('BEGIN');
      try {
        await fn({ execute });
        executeSync('COMMIT');
      } catch (e) {
        executeSync('ROLLBACK');
        throw e;
      }
    },
  };
}
