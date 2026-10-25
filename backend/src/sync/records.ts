/**
 * Pure mapping between wire records and DB rows (no TypeORM imports, so it can
 * be unit tested with plain `node --test`).
 */
import {
  RECORD_FIELDS,
  recordKey,
  type SyncRecords,
  type SyncTable,
  type TableChanges,
} from './protocol.ts';

/** The columns a row of any synced table has besides its data. */
export interface RowMeta {
  userId: string;
  id: string;
  version: number;
  deleted: boolean;
}

export type Row = RowMeta & Record<string, unknown>;

/** Record → row. Languages keep their code in `id`. */
export function toRow<T extends SyncTable>(
  table: T,
  record: SyncRecords[T],
  userId: string,
  version: number,
): Row {
  const data: Record<string, unknown> = { ...record };
  if (table === 'languages') {
    delete data.code;
  }
  return {
    ...data,
    userId,
    id: recordKey(table, record),
    version,
    deleted: false,
  };
}

/** Row → record, with only the wire fields. */
export function toRecord<T extends SyncTable>(
  table: T,
  row: Record<string, unknown>,
): SyncRecords[T] {
  const record: Record<string, unknown> = {};
  for (const key of Object.keys(RECORD_FIELDS[table])) {
    record[key] = table === 'languages' && key === 'code' ? row.id : row[key];
  }
  return record as unknown as SyncRecords[T];
}

/**
 * One row per key (the last upsert wins), and a key that is also deleted is
 * only deleted. Postgres rejects an upsert that touches a row twice.
 */
export function dedupe<T extends SyncTable>(
  table: T,
  changes: TableChanges<SyncRecords[T]>,
): TableChanges<SyncRecords[T]> {
  const deletes = [...new Set(changes.deletes)];
  const deleted = new Set(deletes);
  const upserts = new Map<string, SyncRecords[T]>();
  for (const record of changes.upserts) {
    const key = recordKey(table, record);
    if (!deleted.has(key)) {
      upserts.set(key, record);
    }
  }
  return { upserts: [...upserts.values()], deletes };
}

export function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}
