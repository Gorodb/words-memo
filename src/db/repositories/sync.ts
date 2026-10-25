import type { Scalar } from '@op-engineering/op-sqlite';
import {
  emptyChanges,
  SYNC_TABLES,
  type SyncChanges,
  type SyncRecords,
  type SyncTable,
} from '../../features/sync/protocol';
import { notifyChanged } from '../changes';
import { getDb } from '../database';
import { parseExamples } from './words';

/**
 * Sync bookkeeping. Triggers (migration v9) put the key of every changed row
 * into `sync_queue`; a push sends those rows (or their deletion), and the
 * entries are removed once the server has them.
 */

type Row = Record<string, Scalar>;
type Params = Scalar[];

interface TableSql<T extends SyncTable> {
  /** SQLite table. */
  table: string;
  /** SQL expression of the row key (as the triggers write it). */
  key: string;
  toRecord: (row: Row) => SyncRecords[T];
  /** Insert or update; skipped when a parent row is missing. */
  upsert: (record: SyncRecords[T]) => [string, Params];
  remove: (key: string) => [string, Params];
}

const num = (value: Scalar) => value as number;
const nullableNum = (value: Scalar) => (value as number | null) ?? null;

const TABLES: { [T in SyncTable]: TableSql<T> } = {
  languages: {
    table: 'languages',
    key: 'code',
    toRecord: r => ({
      code: r.code as string,
      name: r.name as string,
      createdAt: num(r.created_at),
    }),
    upsert: l => [
      `INSERT INTO languages (code, name, created_at) VALUES (?, ?, ?)
       ON CONFLICT (code) DO UPDATE SET name = excluded.name`,
      [l.code, l.name, l.createdAt],
    ],
    remove: code => ['DELETE FROM languages WHERE code = ?', [code]],
  },
  sets: {
    table: 'sets',
    key: 'id',
    toRecord: r => ({
      id: r.id as string,
      languageCode: r.language_code as string,
      name: r.name as string,
      pinnedAt: nullableNum(r.pinned_at),
      createdAt: num(r.created_at),
      updatedAt: num(r.updated_at),
    }),
    upsert: s => [
      `INSERT INTO sets (id, language_code, name, pinned_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET language_code = excluded.language_code,
         name = excluded.name, pinned_at = excluded.pinned_at,
         created_at = excluded.created_at, updated_at = excluded.updated_at`,
      [s.id, s.languageCode, s.name, s.pinnedAt, s.createdAt, s.updatedAt],
    ],
    // Its words, rules and folder links go too (ON DELETE CASCADE).
    remove: id => ['DELETE FROM sets WHERE id = ?', [id]],
  },
  folders: {
    table: 'folders',
    key: 'id',
    toRecord: r => ({
      id: r.id as string,
      languageCode: r.language_code as string,
      name: r.name as string,
      position: num(r.position),
      pinnedAt: nullableNum(r.pinned_at),
      createdAt: num(r.created_at),
      updatedAt: num(r.updated_at),
    }),
    upsert: f => [
      `INSERT INTO folders (id, language_code, name, position, pinned_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET language_code = excluded.language_code,
         name = excluded.name, position = excluded.position,
         pinned_at = excluded.pinned_at, created_at = excluded.created_at,
         updated_at = excluded.updated_at`,
      [
        f.id,
        f.languageCode,
        f.name,
        f.position,
        f.pinnedAt,
        f.createdAt,
        f.updatedAt,
      ],
    ],
    remove: id => ['DELETE FROM folders WHERE id = ?', [id]],
  },
  folderSets: {
    table: 'folder_sets',
    key: "folder_id || ':' || set_id",
    toRecord: r => ({
      folderId: r.folder_id as string,
      setId: r.set_id as string,
      addedAt: num(r.added_at),
    }),
    // INSERT … SELECT needs a WHERE before ON CONFLICT (SQLite parsing rule).
    upsert: l => [
      `INSERT INTO folder_sets (folder_id, set_id, added_at)
       SELECT ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM folders WHERE id = ?)
         AND EXISTS (SELECT 1 FROM sets WHERE id = ?)
       ON CONFLICT (folder_id, set_id) DO UPDATE SET added_at = excluded.added_at`,
      [l.folderId, l.setId, l.addedAt, l.folderId, l.setId],
    ],
    remove: key => {
      const [folderId, setId] = key.split(':');
      return [
        'DELETE FROM folder_sets WHERE folder_id = ? AND set_id = ?',
        [folderId, setId],
      ];
    },
  },
  words: {
    table: 'words',
    key: 'id',
    toRecord: r => ({
      id: r.id as string,
      setId: r.set_id as string,
      languageCode: r.language_code as string,
      term: r.term as string,
      termNorm: r.term_norm as string,
      translation: r.translation as string,
      examples: parseExamples(r.examples_json),
      description: (r.description as string | null) ?? '',
      learnedAt: nullableNum(r.learned_at),
      sortAt: num(r.sort_at),
      createdAt: num(r.created_at),
      updatedAt: num(r.updated_at),
    }),
    upsert: w => [
      `INSERT INTO words (id, set_id, language_code, term, term_norm, translation,
         examples_json, description, learned_at, sort_at, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM sets WHERE id = ?)
       ON CONFLICT (id) DO UPDATE SET set_id = excluded.set_id,
         language_code = excluded.language_code, term = excluded.term,
         term_norm = excluded.term_norm, translation = excluded.translation,
         examples_json = excluded.examples_json, description = excluded.description,
         learned_at = excluded.learned_at, sort_at = excluded.sort_at,
         created_at = excluded.created_at, updated_at = excluded.updated_at`,
      [
        w.id,
        w.setId,
        w.languageCode,
        w.term,
        w.termNorm,
        w.translation,
        JSON.stringify(w.examples),
        w.description,
        w.learnedAt,
        w.sortAt,
        w.createdAt,
        w.updatedAt,
        w.setId,
      ],
    ],
    remove: id => ['DELETE FROM words WHERE id = ?', [id]],
  },
  rules: {
    table: 'rules',
    key: 'id',
    toRecord: r => ({
      id: r.id as string,
      setId: r.set_id as string,
      languageCode: r.language_code as string,
      title: (r.title as string | null) ?? '',
      text: r.text as string,
      createdAt: num(r.created_at),
      updatedAt: num(r.updated_at),
    }),
    upsert: r => [
      `INSERT INTO rules (id, set_id, language_code, title, text, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM sets WHERE id = ?)
       ON CONFLICT (id) DO UPDATE SET set_id = excluded.set_id,
         language_code = excluded.language_code, title = excluded.title,
         text = excluded.text, created_at = excluded.created_at,
         updated_at = excluded.updated_at`,
      [
        r.id,
        r.setId,
        r.languageCode,
        r.title,
        r.text,
        r.createdAt,
        r.updatedAt,
        r.setId,
      ],
    ],
    remove: id => ['DELETE FROM rules WHERE id = ?', [id]],
  },
};

/** Keys per IN (…) query, far below SQLite's bound-parameter limit. */
const CHUNK = 500;

export interface OutgoingChanges {
  changes: SyncChanges;
  /** Queue entries up to this seq are in `changes`; ack them after the push. */
  upToSeq: number;
}

/**
 * What to push. `full` (first sync after sign in) sends every row, plus the
 * deletions still in the queue; otherwise only the queued rows.
 */
export async function collectChanges(full: boolean): Promise<OutgoingChanges> {
  const db = getDb();
  const { rows: top } = await db.execute(
    'SELECT COALESCE(MAX(seq), 0) AS seq FROM sync_queue',
  );
  const upToSeq = num(top[0].seq);
  const { rows: queued } = await db.execute(
    'SELECT table_name, row_key FROM sync_queue WHERE seq <= ?',
    [upToSeq],
  );
  const changes = emptyChanges();
  for (const table of SYNC_TABLES) {
    const sql = TABLES[table];
    const keys = queued
      .filter(q => q.table_name === table)
      .map(q => q.row_key as string);
    const existing = new Map<string, Row>();
    if (full) {
      const { rows } = await db.execute(
        `SELECT *, ${sql.key} AS row_key FROM ${sql.table}`,
      );
      rows.forEach(r => existing.set(r.row_key as string, r));
    } else {
      for (let i = 0; i < keys.length; i += CHUNK) {
        const part = keys.slice(i, i + CHUNK);
        const { rows } = await db.execute(
          `SELECT *, ${sql.key} AS row_key FROM ${sql.table}
           WHERE ${sql.key} IN (${part.map(() => '?').join(', ')})`,
          part,
        );
        rows.forEach(r => existing.set(r.row_key as string, r));
      }
    }
    const out = changes[table] as {
      upserts: SyncRecords[SyncTable][];
      deletes: string[];
    };
    out.upserts = [...existing.values()].map(r => sql.toRecord(r));
    out.deletes = keys.filter(key => !existing.has(key));
  }
  return { changes, upToSeq };
}

/** Upserts parents first, deletes children first. */
const DELETE_ORDER = [...SYNC_TABLES].reverse();

/**
 * Applies what the server sent and acks the pushed queue entries, in one
 * transaction. Rows changed on the phone since the push (newer queue entries)
 * are skipped: the phone's state wins and goes out with the next push.
 *
 * Synchronous on purpose: op-sqlite's plain `execute` calls don't wait for a
 * transaction, so a write from the UI during an async transaction would run
 * inside it, while the triggers are paused, and never reach the queue.
 * With executeSync nothing else can run in between; if another transaction
 * is open, BEGIN fails and the sync is retried later.
 */
export function applyRemoteChanges(
  changes: SyncChanges,
  upToSeq: number,
): void {
  const db = getDb();
  db.executeSync('BEGIN');
  try {
    const pending = new Set(
      db
        .executeSync(
          'SELECT table_name, row_key FROM sync_queue WHERE seq > ?',
          [upToSeq],
        )
        .rows.map(r => `${r.table_name}/${r.row_key}`),
    );
    const isPending = (table: SyncTable, key: string) =>
      pending.has(`${table}/${key}`);
    const keyOf = (table: SyncTable, record: SyncRecords[SyncTable]) =>
      table === 'languages'
        ? (record as SyncRecords['languages']).code
        : table === 'folderSets'
        ? `${(record as SyncRecords['folderSets']).folderId}:${
            (record as SyncRecords['folderSets']).setId
          }`
        : (record as { id: string }).id;

    db.executeSync('INSERT OR IGNORE INTO sync_pause (id) VALUES (1)');
    for (const table of SYNC_TABLES) {
      const sql = TABLES[table] as TableSql<SyncTable>;
      for (const record of changes[table].upserts) {
        if (!isPending(table, keyOf(table, record))) {
          db.executeSync(...sql.upsert(record));
        }
      }
    }
    const kept: Array<[string, Params]> = [];
    for (const table of DELETE_ORDER) {
      for (const key of changes[table].deletes) {
        if (isPending(table, key)) {
          continue;
        }
        const touch = keepInstead(table, key, upToSeq);
        if (touch) {
          kept.push(touch);
        } else {
          db.executeSync(...TABLES[table].remove(key));
        }
      }
    }
    db.executeSync('DELETE FROM sync_pause');
    // A no-op update fires the trigger, so a kept row is pushed again.
    kept.forEach(touch => db.executeSync(...touch));
    db.executeSync('DELETE FROM sync_queue WHERE seq <= ?', [upToSeq]);
    db.executeSync('COMMIT');
  } catch (e) {
    db.executeSync('ROLLBACK');
    throw e;
  }
  if (
    SYNC_TABLES.some(
      t => changes[t].upserts.length || changes[t].deletes.length,
    )
  ) {
    notifyChanged(
      'languages',
      'folders',
      'sets',
      'folder_sets',
      'words',
      'rules',
    );
  }
}

/** A queued (not pushed yet) row of `table` matching `where`. */
const PENDING = (
  table: string,
  syncTable: SyncTable,
  key: string,
  where: string,
) =>
  `EXISTS (SELECT 1 FROM sync_queue q JOIN ${table} t
     ON q.table_name = '${syncTable}' AND q.row_key = ${key}
     WHERE q.seq > ? AND ${where})`;

/**
 * The phone's state wins over a deletion made elsewhere when the deletion
 * would take local changes the server doesn't have yet with it: a set or
 * folder whose words, rules or folder links changed here since the push, or
 * a language that still has sets or folders here (no foreign key holds them).
 * Returns the statement that queues the kept row again, or null to delete.
 */
function keepInstead(
  table: SyncTable,
  key: string,
  upToSeq: number,
): [string, Params] | null {
  const db = getDb();
  const holds = (sql: string, params: Params) =>
    !!db.executeSync(`SELECT ${sql} AS held`, params).rows[0].held;
  const link = "t.folder_id || ':' || t.set_id";
  switch (table) {
    case 'languages':
      return holds(
        `EXISTS (SELECT 1 FROM sets WHERE language_code = ?)
         OR EXISTS (SELECT 1 FROM folders WHERE language_code = ?)`,
        [key, key],
      )
        ? ['UPDATE languages SET name = name WHERE code = ?', [key]]
        : null;
    case 'sets':
      return holds(
        `${PENDING('words', 'words', 't.id', 't.set_id = ?')}
         OR ${PENDING('rules', 'rules', 't.id', 't.set_id = ?')}
         OR ${PENDING('folder_sets', 'folderSets', link, 't.set_id = ?')}`,
        [upToSeq, key, upToSeq, key, upToSeq, key],
      )
        ? ['UPDATE sets SET name = name WHERE id = ?', [key]]
        : null;
    case 'folders':
      return holds(
        PENDING('folder_sets', 'folderSets', link, 't.folder_id = ?'),
        [upToSeq, key],
      )
        ? ['UPDATE folders SET name = name WHERE id = ?', [key]]
        : null;
    default:
      return null;
  }
}

/** Whether there are local changes the server doesn't have yet. */
export async function hasPendingChanges(): Promise<boolean> {
  const { rows } = await getDb().execute(
    'SELECT EXISTS (SELECT 1 FROM sync_queue) AS pending',
  );
  return !!rows[0].pending;
}
