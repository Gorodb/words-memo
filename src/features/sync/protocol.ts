/**
 * Sync wire format. The backend has the same types (plus request validation)
 * in `backend/src/sync/protocol.ts`; keep both in step.
 *
 * Records carry the app's own ids; folder links are keyed `folderId:setId`
 * and custom languages by `code`. Timestamps are milliseconds since epoch.
 */

/** In the order pulled upserts are applied (parents first). */
export const SYNC_TABLES = [
  'languages',
  'sets',
  'folders',
  'folderSets',
  'words',
  'rules',
] as const;

export type SyncTable = (typeof SYNC_TABLES)[number];

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

export interface FolderSetRecord {
  folderId: string;
  setId: string;
  addedAt: number;
}

export interface WordRecord {
  id: string;
  setId: string;
  languageCode: string;
  term: string;
  termNorm: string;
  translation: string;
  examples: Array<{ text: string; translation: string }>;
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
  upserts: R[];
  /** Keys of deleted rows. */
  deletes: string[];
}

export type SyncChanges = {
  [T in SyncTable]: TableChanges<SyncRecords[T]>;
};

export interface SyncRequest {
  /** From the last response; null = full sync (first sync after sign in). */
  cursor: number | null;
  changes: SyncChanges;
}

export interface SyncResponse {
  cursor: number;
  /** What other devices changed since `cursor`. */
  changes: SyncChanges;
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

export function countChanges(changes: SyncChanges): number {
  return SYNC_TABLES.reduce(
    (n, t) => n + changes[t].upserts.length + changes[t].deletes.length,
    0,
  );
}
