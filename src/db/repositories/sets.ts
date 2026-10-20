import type { Scalar } from '@op-engineering/op-sqlite';
import { MAX_PINNED, PinLimitError } from '../../domain/pinning';
import type { ID, LanguageCode, WordSet } from '../../domain/types';
import { createId } from '../../utils/id';
import { notifyChanged } from '../changes';
import { getDb } from '../database';

export interface WordSetWithCount extends WordSet {
  wordCount: number;
}

export interface PickableSet extends WordSetWithCount {
  /** Whether the set is in the folder the picker was opened for. */
  inFolder: boolean;
}

type Row = Record<string, Scalar>;

function toSet(row: Row): WordSet {
  return {
    id: row.id as string,
    languageCode: row.language_code as string,
    name: row.name as string,
    pinnedAt: (row.pinned_at as number | null) ?? null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function toSetWithCount(row: Row): WordSetWithCount {
  return { ...toSet(row), wordCount: row.word_count as number };
}

const WORD_COUNT =
  '(SELECT COUNT(*) FROM words w WHERE w.set_id = s.id) AS word_count';

/** All sets of a language (Sets tab). */
export async function listSets(
  languageCode: LanguageCode,
): Promise<WordSetWithCount[]> {
  const { rows } = await getDb().execute(
    `SELECT s.*, ${WORD_COUNT}
     FROM sets s
     WHERE s.language_code = ?
     ORDER BY s.pinned_at IS NULL, s.name COLLATE NOCASE`,
    [languageCode],
  );
  return rows.map(toSetWithCount);
}

/** Sets pinned to a folder. */
export async function listSetsInFolder(
  folderId: ID,
): Promise<WordSetWithCount[]> {
  const { rows } = await getDb().execute(
    `SELECT s.*, ${WORD_COUNT}
     FROM sets s
     JOIN folder_sets fs ON fs.set_id = s.id
     WHERE fs.folder_id = ?
     ORDER BY s.pinned_at IS NULL, s.name COLLATE NOCASE`,
    [folderId],
  );
  return rows.map(toSetWithCount);
}

/** All sets of the folder's language, each flagged as pinned to it or not. */
export async function listSetsForPicker(
  folderId: ID,
  languageCode: LanguageCode,
): Promise<PickableSet[]> {
  const { rows } = await getDb().execute(
    `SELECT s.*, ${WORD_COUNT},
       EXISTS (SELECT 1 FROM folder_sets fs WHERE fs.folder_id = ? AND fs.set_id = s.id) AS in_folder
     FROM sets s
     WHERE s.language_code = ?
     ORDER BY s.pinned_at IS NULL, s.name COLLATE NOCASE`,
    [folderId, languageCode],
  );
  return rows.map(row => ({ ...toSetWithCount(row), inFolder: !!row.in_folder }));
}

export async function getSet(id: ID): Promise<WordSet | null> {
  const { rows } = await getDb().execute('SELECT * FROM sets WHERE id = ?', [
    id,
  ]);
  return rows[0] ? toSet(rows[0]) : null;
}

/** Creates a set; with `addToFolder`, also adds it to that folder. */
export async function createSet(
  languageCode: LanguageCode,
  name: string,
  addToFolder?: ID,
): Promise<WordSet> {
  const now = Date.now();
  const set: WordSet = {
    id: createId(),
    languageCode,
    name: name.trim(),
    pinnedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await getDb().transaction(async tx => {
    await tx.execute(
      'INSERT INTO sets (id, language_code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [set.id, languageCode, set.name, now, now],
    );
    if (addToFolder) {
      await tx.execute(
        'INSERT INTO folder_sets (folder_id, set_id, added_at) VALUES (?, ?, ?)',
        [addToFolder, set.id, now],
      );
    }
  });
  if (addToFolder) {
    notifyChanged('sets', 'folder_sets');
  } else {
    notifyChanged('sets');
  }
  return set;
}

export async function renameSet(id: ID, name: string): Promise<void> {
  await getDb().execute(
    'UPDATE sets SET name = ?, updated_at = ? WHERE id = ?',
    [name.trim(), Date.now(), id],
  );
  notifyChanged('sets');
}

/** Deletes the set's words and unpins it everywhere (ON DELETE CASCADE). */
export async function deleteSet(id: ID): Promise<void> {
  await getDb().execute('DELETE FROM sets WHERE id = ?', [id]);
  notifyChanged('sets', 'folder_sets', 'words');
}

/** Pins / unpins a set; throws PinLimitError above MAX_PINNED per language. */
export async function setSetPinned(id: ID, pinned: boolean): Promise<void> {
  const db = getDb();
  if (pinned) {
    const { rows } = await db.execute(
      `SELECT COUNT(*) AS n FROM sets
       WHERE pinned_at IS NOT NULL AND id <> ?
         AND language_code = (SELECT language_code FROM sets WHERE id = ?)`,
      [id, id],
    );
    if ((rows[0].n as number) >= MAX_PINNED) {
      throw new PinLimitError('sets');
    }
  }
  await db.execute(
    'UPDATE sets SET pinned_at = CASE WHEN ? THEN COALESCE(pinned_at, ?) ELSE NULL END WHERE id = ?',
    [pinned ? 1 : 0, Date.now(), id],
  );
  notifyChanged('sets');
}

/** Adds the set to the folder or removes it from there (the set itself stays). */
export async function setInFolder(
  folderId: ID,
  setId: ID,
  inFolder: boolean,
): Promise<void> {
  await getDb().execute(
    inFolder
      ? 'INSERT OR IGNORE INTO folder_sets (folder_id, set_id, added_at) VALUES (?, ?, ?)'
      : 'DELETE FROM folder_sets WHERE folder_id = ? AND set_id = ?',
    inFolder ? [folderId, setId, Date.now()] : [folderId, setId],
  );
  notifyChanged('folder_sets');
}
