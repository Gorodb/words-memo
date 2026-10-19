import type { Scalar } from '@op-engineering/op-sqlite';
import type { Folder, ID, LanguageCode } from '../../domain/types';
import { createId } from '../../utils/id';
import { notifyChanged } from '../changes';
import { getDb } from '../database';

export interface FolderWithCount extends Folder {
  setCount: number;
}

type Row = Record<string, Scalar>;

function toFolder(row: Row): Folder {
  return {
    id: row.id as string,
    languageCode: row.language_code as string,
    name: row.name as string,
    position: row.position as number,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

/** In the user's manual (drag and drop) order. */
export async function listFolders(
  languageCode: LanguageCode,
): Promise<FolderWithCount[]> {
  const { rows } = await getDb().execute(
    `SELECT f.*, (SELECT COUNT(*) FROM folder_sets fs WHERE fs.folder_id = f.id) AS set_count
     FROM folders f
     WHERE f.language_code = ?
     ORDER BY f.position, f.created_at`,
    [languageCode],
  );
  return rows.map(row => ({
    ...toFolder(row),
    setCount: row.set_count as number,
  }));
}

export async function getFolder(id: ID): Promise<Folder | null> {
  const { rows } = await getDb().execute(
    'SELECT * FROM folders WHERE id = ?',
    [id],
  );
  return rows[0] ? toFolder(rows[0]) : null;
}

/** New folders go to the end of the manual order. */
export async function createFolder(
  languageCode: LanguageCode,
  name: string,
): Promise<Folder> {
  const db = getDb();
  const { rows } = await db.execute(
    'SELECT COALESCE(MAX(position) + 1, 0) AS next FROM folders WHERE language_code = ?',
    [languageCode],
  );
  const now = Date.now();
  const folder: Folder = {
    id: createId(),
    languageCode,
    name: name.trim(),
    position: rows[0].next as number,
    createdAt: now,
    updatedAt: now,
  };
  await db.execute(
    'INSERT INTO folders (id, language_code, name, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [folder.id, languageCode, folder.name, folder.position, now, now],
  );
  notifyChanged('folders');
  return folder;
}

export async function renameFolder(id: ID, name: string): Promise<void> {
  await getDb().execute(
    'UPDATE folders SET name = ?, updated_at = ? WHERE id = ?',
    [name.trim(), Date.now(), id],
  );
  notifyChanged('folders');
}

/** Saves a new manual order: `orderedIds[i]` gets position i. */
export async function reorderFolders(orderedIds: ID[]): Promise<void> {
  await getDb().transaction(async tx => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.execute('UPDATE folders SET position = ? WHERE id = ?', [
        i,
        orderedIds[i],
      ]);
    }
  });
  notifyChanged('folders');
}

/** Unpins the folder's sets (ON DELETE CASCADE on folder_sets); the sets stay. */
export async function deleteFolder(id: ID): Promise<void> {
  await getDb().execute('DELETE FROM folders WHERE id = ?', [id]);
  notifyChanged('folders', 'folder_sets');
}
