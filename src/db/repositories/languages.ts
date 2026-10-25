import type { Language, LanguageCode } from '../../domain/types';
import { createId } from '../../utils/id';
import { notifyChanged } from '../changes';
import { getDb } from '../database';

/** Codes of custom languages start with this, so they never clash with ISO codes. */
export const CUSTOM_LANGUAGE_PREFIX = 'x-';

/** Sync on purpose: read at startup, before the first render. */
export function listCustomLanguages(): Language[] {
  const { rows } = getDb().executeSync(
    'SELECT code, name FROM languages ORDER BY created_at',
  );
  return rows.map(row => ({
    code: row.code as string,
    name: row.name as string,
    nativeName: row.name as string,
    custom: true,
  }));
}

export async function createLanguage(name: string): Promise<Language> {
  const language: Language = {
    code: CUSTOM_LANGUAGE_PREFIX + createId(),
    name: name.trim(),
    nativeName: name.trim(),
    custom: true,
  };
  await getDb().execute(
    'INSERT INTO languages (code, name, created_at) VALUES (?, ?, ?)',
    [language.code, language.name, Date.now()],
  );
  notifyChanged('languages');
  return language;
}

export async function renameLanguage(
  code: LanguageCode,
  name: string,
): Promise<void> {
  await getDb().execute('UPDATE languages SET name = ? WHERE code = ?', [
    name.trim(),
    code,
  ]);
  notifyChanged('languages');
}

/** Deletes the language with all its folders, sets and words. */
export async function deleteLanguage(code: LanguageCode): Promise<void> {
  await getDb().transaction(async tx => {
    // Words and folder links go with their sets and folders (ON DELETE CASCADE).
    await tx.execute('DELETE FROM sets WHERE language_code = ?', [code]);
    await tx.execute('DELETE FROM folders WHERE language_code = ?', [code]);
    await tx.execute('DELETE FROM languages WHERE code = ?', [code]);
  });
  notifyChanged(
    'languages',
    'folders',
    'sets',
    'folder_sets',
    'words',
    'rules',
  );
}

/** Number of sets and words of a language, for the delete confirmation. */
export async function countLanguageContent(
  code: LanguageCode,
): Promise<{ sets: number; words: number }> {
  const { rows } = await getDb().execute(
    `SELECT (SELECT COUNT(*) FROM sets WHERE language_code = ?) AS sets,
            (SELECT COUNT(*) FROM words WHERE language_code = ?) AS words`,
    [code, code],
  );
  return { sets: rows[0].sets as number, words: rows[0].words as number };
}
