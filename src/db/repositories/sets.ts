import type { Scalar } from '@op-engineering/op-sqlite';
import type { ID, LanguageCode, WordSet } from '../../domain/types';
import { createId } from '../../utils/id';
import { notifyChanged } from '../changes';
import { getDb } from '../database';

export interface WordSetWithCount extends WordSet {
  wordCount: number;
}

export interface PickableSet extends WordSetWithCount {
  /** Whether the set is pinned to the folder the picker was opened for. */
  pinned: boolean;
}

type Row = Record<string, Scalar>;

function toSet(row: Row): WordSet {
  return {
    id: row.id as string,
    languageCode: row.language_code as string,
    name: row.name as string,
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
     ORDER BY s.name COLLATE NOCASE`,
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
     ORDER BY s.name COLLATE NOCASE`,
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
       EXISTS (SELECT 1 FROM folder_sets fs WHERE fs.folder_id = ? AND fs.set_id = s.id) AS pinned
     FROM sets s
     WHERE s.language_code = ?
     ORDER BY s.name COLLATE NOCASE`,
    [folderId, languageCode],
  );
  return rows.map(row => ({ ...toSetWithCount(row), pinned: !!row.pinned }));
}

export async function getSet(id: ID): Promise<WordSet | null> {
  const { rows } = await getDb().execute('SELECT * FROM sets WHERE id = ?', [
    id,
  ]);
  return rows[0] ? toSet(rows[0]) : null;
}

/** Creates a set; with `pinTo`, also pins it to that folder. */
export async function createSet(
  languageCode: LanguageCode,
  name: string,
  pinTo?: ID,
): Promise<WordSet> {
  const now = Date.now();
  const set: WordSet = {
    id: createId(),
    languageCode,
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
  };
  await getDb().transaction(async tx => {
    await tx.execute(
      'INSERT INTO sets (id, language_code, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [set.id, languageCode, set.name, now, now],
    );
    if (pinTo) {
      await tx.execute(
        'INSERT INTO folder_sets (folder_id, set_id, added_at) VALUES (?, ?, ?)',
        [pinTo, set.id, now],
      );
    }
  });
  if (pinTo) {
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

export async function setPinned(
  folderId: ID,
  setId: ID,
  pinned: boolean,
): Promise<void> {
  await getDb().execute(
    pinned
      ? 'INSERT OR IGNORE INTO folder_sets (folder_id, set_id, added_at) VALUES (?, ?, ?)'
      : 'DELETE FROM folder_sets WHERE folder_id = ? AND set_id = ?',
    pinned ? [folderId, setId, Date.now()] : [folderId, setId],
  );
  notifyChanged('folder_sets');
}
