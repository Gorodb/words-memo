import type { Scalar } from '@op-engineering/op-sqlite';
import { normalizeTerm } from '../../domain/term';
import type { ID, Word, WordInput } from '../../domain/types';
import { createId } from '../../utils/id';
import { notifyChanged } from '../changes';
import { getDb } from '../database';

type Row = Record<string, Scalar>;

function parseExamples(json: Scalar): string[] {
  try {
    const parsed = JSON.parse(String(json));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function toWord(row: Row): Word {
  return {
    id: row.id as string,
    setId: row.set_id as string,
    languageCode: row.language_code as string,
    term: row.term as string,
    translation: row.translation as string,
    examples: parseExamples(row.examples_json),
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

/** Newest first, so a freshly added word shows up at the top. */
export async function listWords(setId: ID): Promise<Word[]> {
  const { rows } = await getDb().execute(
    'SELECT * FROM words WHERE set_id = ? ORDER BY created_at DESC, rowid DESC',
    [setId],
  );
  return rows.map(toWord);
}

/** The word inherits the language of its set. */
export async function createWord(setId: ID, input: WordInput): Promise<Word> {
  const db = getDb();
  const { rows } = await db.execute(
    'SELECT language_code FROM sets WHERE id = ?',
    [setId],
  );
  if (!rows[0]) {
    throw new Error(`Set ${setId} not found`);
  }
  const now = Date.now();
  const word: Word = {
    id: createId(),
    setId,
    languageCode: rows[0].language_code as string,
    term: input.term.trim(),
    translation: input.translation.trim(),
    examples: input.examples,
    createdAt: now,
    updatedAt: now,
  };
  await db.execute(
    `INSERT INTO words (id, set_id, language_code, term, term_norm, translation, examples_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      word.id,
      setId,
      word.languageCode,
      word.term,
      normalizeTerm(word.term),
      word.translation,
      JSON.stringify(word.examples),
      now,
      now,
    ],
  );
  notifyChanged('words');
  return word;
}

export async function updateWord(id: ID, input: WordInput): Promise<void> {
  const term = input.term.trim();
  await getDb().execute(
    `UPDATE words
     SET term = ?, term_norm = ?, translation = ?, examples_json = ?, updated_at = ?
     WHERE id = ?`,
    [
      term,
      normalizeTerm(term),
      input.translation.trim(),
      JSON.stringify(input.examples),
      Date.now(),
      id,
    ],
  );
  notifyChanged('words');
}

export async function deleteWord(id: ID): Promise<void> {
  await getDb().execute('DELETE FROM words WHERE id = ?', [id]);
  notifyChanged('words');
}
