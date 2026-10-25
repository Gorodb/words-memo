/**
 * Sync wire format. The app has the same types in
 * `src/features/sync/protocol.ts`; keep both in step.
 *
 * Every record carries the client's own string id (or a key built from its
 * fields, see `recordKey`). Timestamps are milliseconds since epoch.
 */

export const SYNC_TABLES = [
  'languages',
  'sets',
  'folders',
  'folderSets',
  'words',
  'rules',
] as const;

export type SyncTable = (typeof SYNC_TABLES)[number];

/** A custom language (bundled ones aren't synced). Key: `code`. */
export interface LanguageRecord {
  code: string;
  name: string;
  createdAt: number;
}

export interface FolderRecord {
  id: string;
  languageCode: string;
  name: string;
  position: number;
  pinnedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface SetRecord {
  id: string;
  languageCode: string;
  name: string;
  pinnedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** A set in a folder. Key: `folderId:setId`. */
export interface FolderSetRecord {
  folderId: string;
  setId: string;
  addedAt: number;
}

export interface ExampleRecord {
  text: string;
  translation: string;
}

export interface WordRecord {
  id: string;
  setId: string;
  languageCode: string;
  term: string;
  termNorm: string;
  translation: string;
  examples: ExampleRecord[];
  description: string;
  learnedAt: number | null;
  sortAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface RuleRecord {
  id: string;
  setId: string;
  languageCode: string;
  title: string;
  text: string;
  createdAt: number;
  updatedAt: number;
}

export interface SyncRecords {
  languages: LanguageRecord;
  sets: SetRecord;
  folders: FolderRecord;
  folderSets: FolderSetRecord;
  words: WordRecord;
  rules: RuleRecord;
}

export interface TableChanges<R> {
  /** Rows that exist, in full. */
  upserts: R[];
  /** Keys of deleted rows. */
  deletes: string[];
}

export type SyncChanges = {
  [T in SyncTable]: TableChanges<SyncRecords[T]>;
};

export interface SyncRequest {
  /**
   * `cursor` from the last response, or null for a full sync (first sync after
   * login): the response then holds every live row the phone didn't send.
   */
  cursor: number | null;
  changes: SyncChanges;
}

export interface SyncResponse {
  /** Pass it back as `cursor` next time. */
  cursor: number;
  /** Changes made by other devices since `cursor`. */
  changes: SyncChanges;
}

export function recordKey<T extends SyncTable>(
  table: T,
  record: SyncRecords[T],
): string {
  switch (table) {
    case 'languages':
      return (record as LanguageRecord).code;
    case 'folderSets': {
      const link = record as FolderSetRecord;
      return `${link.folderId}:${link.setId}`;
    }
    default:
      return (record as { id: string }).id;
  }
}

export function emptyChanges(): SyncChanges {
  return {
    languages: { upserts: [], deletes: [] },
    sets: { upserts: [], deletes: [] },
    folders: { upserts: [], deletes: [] },
    folderSets: { upserts: [], deletes: [] },
    words: { upserts: [], deletes: [] },
    rules: { upserts: [], deletes: [] },
  };
}

// ---------------------------------------------------------------------------
// Validation of untrusted request bodies.

export class SyncFormatError extends Error {}

const MAX_ID = 100;
const MAX_NAME = 500;
const MAX_TEXT = 200_000;

type Field =
  | { kind: 'id' }
  | { kind: 'string'; max: number }
  | { kind: 'number' }
  | { kind: 'nullableNumber' }
  | { kind: 'examples' };

const id: Field = { kind: 'id' };
const name: Field = { kind: 'string', max: MAX_NAME };
const text: Field = { kind: 'string', max: MAX_TEXT };
const num: Field = { kind: 'number' };
const nullableNum: Field = { kind: 'nullableNumber' };

/** Fields of each record and how to check them. */
export const RECORD_FIELDS: { [T in SyncTable]: Record<string, Field> } = {
  languages: { code: id, name, createdAt: num },
  sets: {
    id,
    languageCode: id,
    name,
    pinnedAt: nullableNum,
    createdAt: num,
    updatedAt: num,
  },
  folders: {
    id,
    languageCode: id,
    name,
    position: num,
    pinnedAt: nullableNum,
    createdAt: num,
    updatedAt: num,
  },
  folderSets: { folderId: id, setId: id, addedAt: num },
  words: {
    id,
    setId: id,
    languageCode: id,
    term: text,
    termNorm: text,
    translation: text,
    examples: { kind: 'examples' },
    description: text,
    learnedAt: nullableNum,
    sortAt: num,
    createdAt: num,
    updatedAt: num,
  },
  rules: {
    id,
    setId: id,
    languageCode: id,
    title: text,
    text,
    createdAt: num,
    updatedAt: num,
  },
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function checkField(field: Field, value: unknown, path: string): unknown {
  switch (field.kind) {
    case 'id':
      if (typeof value !== 'string' || value === '' || value.length > MAX_ID) {
        throw new SyncFormatError(`${path}: expected an id`);
      }
      return value;
    case 'string':
      if (typeof value !== 'string' || value.length > field.max) {
        throw new SyncFormatError(
          `${path}: expected a string of at most ${field.max} characters`,
        );
      }
      return value;
    case 'number':
      if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
        throw new SyncFormatError(`${path}: expected an integer`);
      }
      return value;
    case 'nullableNumber':
      return value === null || value === undefined
        ? null
        : checkField(num, value, path);
    case 'examples':
      if (!Array.isArray(value)) {
        throw new SyncFormatError(`${path}: expected a list of examples`);
      }
      return value.map((example, i) => {
        if (!isObject(example)) {
          throw new SyncFormatError(`${path}[${i}]: expected an example`);
        }
        return {
          text: checkField(text, example.text, `${path}[${i}].text`),
          translation: checkField(
            text,
            example.translation,
            `${path}[${i}].translation`,
          ),
        };
      });
  }
}

/** Copies only the known fields, so unknown ones never reach the DB. */
function parseRecord<T extends SyncTable>(
  table: T,
  value: unknown,
  path: string,
): SyncRecords[T] {
  if (!isObject(value)) {
    throw new SyncFormatError(`${path}: expected an object`);
  }
  const record: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(RECORD_FIELDS[table])) {
    record[key] = checkField(field, value[key], `${path}.${key}`);
  }
  return record as unknown as SyncRecords[T];
}

function parseTable<T extends SyncTable>(
  table: T,
  value: unknown,
): TableChanges<SyncRecords[T]> {
  if (value === undefined) {
    return { upserts: [], deletes: [] };
  }
  if (!isObject(value)) {
    throw new SyncFormatError(`changes.${table}: expected an object`);
  }
  const upserts = value.upserts ?? [];
  const deletes = value.deletes ?? [];
  if (!Array.isArray(upserts) || !Array.isArray(deletes)) {
    throw new SyncFormatError(
      `changes.${table}: upserts and deletes must be lists`,
    );
  }
  return {
    upserts: upserts.map((r, i) =>
      parseRecord(table, r, `changes.${table}.upserts[${i}]`),
    ),
    deletes: deletes.map(
      (key, i) =>
        checkField(
          { kind: 'string', max: MAX_ID * 2 + 1 },
          key,
          `changes.${table}.deletes[${i}]`,
        ) as string,
    ),
  };
}

/** Turns an untrusted body into a SyncRequest, or throws SyncFormatError. */
export function parseSyncRequest(body: unknown): SyncRequest {
  if (!isObject(body)) {
    throw new SyncFormatError('Expected a JSON object');
  }
  const { cursor } = body;
  if (
    cursor !== null &&
    cursor !== undefined &&
    (typeof cursor !== 'number' || !Number.isSafeInteger(cursor) || cursor < 0)
  ) {
    throw new SyncFormatError('cursor: expected null or a non-negative integer');
  }
  const changes = body.changes ?? {};
  if (!isObject(changes)) {
    throw new SyncFormatError('changes: expected an object');
  }
  const parsed = emptyChanges();
  for (const table of SYNC_TABLES) {
    (parsed as Record<SyncTable, TableChanges<unknown>>)[table] = parseTable(
      table,
      changes[table],
    );
  }
  return { cursor: (cursor as number | null | undefined) ?? null, changes: parsed };
}
