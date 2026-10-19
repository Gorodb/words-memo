import { getDb } from '../database';

/** Sync on purpose: read once at startup, before the first render. */
export function readSettings(): Record<string, string> {
  const { rows } = getDb().executeSync('SELECT key, value FROM settings');
  return Object.fromEntries(
    rows.map(row => [row.key as string, row.value as string]),
  );
}

export function writeSetting(key: string, value: string): void {
  getDb().executeSync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}
