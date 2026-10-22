import type { Scalar } from '@op-engineering/op-sqlite';
import { normalizeTerm } from '../../domain/term';
import type { Example, ID, Word, WordInput } from '../../domain/types';
import { createId } from '../../utils/id';
import { notifyChanged } from '../changes';
import { getDb } from '../database';

type Row = Record<string, Scalar>;

/**
 * A sort key above every word in the set, so the word lands on top of its
 * part even when two changes happen within the same millisecond.
 */
const NEXT_SORT_AT = (setIdExpr: string) =>
  `MAX(?, (SELECT COALESCE(MAX(w2.sort_at), 0) + 1 FROM words w2 WHERE w2.set_id = ${setIdExpr}))`;

/** Accepts current `{text, translation}` objects and legacy plain strings. */
export function parseExamples(json: Scalar): Example[] {
  try {
    const parsed = JSON.parse(String(json));
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(item =>
      typeof item === 'string'
        ? { text: item, translation: '' }
        : {
            text: String(item?.text ?? ''),
            translation: String(item?.translation ?? ''),
          },
    );
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
    learnedAt: (row.learned_at as number | null) ?? null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

/**
 * Words to learn first, then learned ones. Within each part the most
 * recently added (or moved) word is on top.
 */
export async function listWords(setId: ID): Promise<Word[]> {
  const { rows } = await getDb().execute(
    `SELECT * FROM words WHERE set_id = ?
     ORDER BY learned_at IS NOT NULL, sort_at DESC, rowid DESC`,
    [setId],
  );
  return rows.map(toWord);
}

/** Words by id, in the order of `ids` (missing ones are skipped). */
export async function getWords(ids: ID[]): Promise<Word[]> {
  if (ids.length === 0) {
    return [];
  }
  const { rows } = await getDb().execute(
    `SELECT * FROM words WHERE id IN (${ids.map(() => '?').join(', ')})`,
    ids,
  );
  const byId = new Map(rows.map(row => [row.id as string, toWord(row)]));
  return ids.flatMap(id => byId.get(id) ?? []);
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
    learnedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.execute(
    `INSERT INTO words (id, set_id, language_code, term, term_norm, translation, examples_json, sort_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ${NEXT_SORT_AT('?')}, ?, ?)`,
    [
      word.id,
      setId,
      word.languageCode,
      word.term,
      normalizeTerm(word.term),
      word.translation,
      JSON.stringify(word.examples),
      now,
      setId,
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

/**
 * "Learned" moves the word to the top of the learned part,
 * "To revise" (learned = false) to the top of the list.
 */
export async function setLearned(id: ID, learned: boolean): Promise<void> {
  const now = Date.now();
  await getDb().execute(
    `UPDATE words SET learned_at = ?, sort_at = ${NEXT_SORT_AT(
      'words.set_id',
    )}, updated_at = ?
     WHERE id = ?`,
    [learned ? now : null, now, now, id],
  );
  notifyChanged('words');
}

/** Marks several words as learned (one transaction, one change event). */
export async function setLearnedMany(ids: ID[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const now = Date.now();
  await getDb().transaction(async tx => {
    for (const id of ids) {
      await tx.execute(
        `UPDATE words SET learned_at = ?, sort_at = ${NEXT_SORT_AT(
          'words.set_id',
        )}, updated_at = ?
         WHERE id = ?`,
        [now, now, now, id],
      );
    }
  });
  notifyChanged('words');
}

/**
 * Random words of the same language from other sets, as wrong options in
 * study games when the set itself has too few words.
 */
export async function sampleWordsOutsideSet(
  setId: ID,
  limit: number,
): Promise<Pick<Word, 'id' | 'term' | 'translation'>[]> {
  const { rows } = await getDb().execute(
    `SELECT id, term, translation FROM words
     WHERE set_id <> ?
       AND language_code = (SELECT language_code FROM sets WHERE id = ?)
     ORDER BY RANDOM() LIMIT ?`,
    [setId, setId, limit],
  );
  return rows.map(row => ({
    id: row.id as string,
    term: row.term as string,
    translation: row.translation as string,
  }));
}

/** Marks every learned word of the set as not learned. Keeps their order. */
export async function resetLearned(setId: ID): Promise<void> {
  await getDb().execute(
    `UPDATE words SET learned_at = NULL, updated_at = ?
     WHERE set_id = ? AND learned_at IS NOT NULL`,
    [Date.now(), setId],
  );
  notifyChanged('words');
}

export async function deleteWord(id: ID): Promise<void> {
  await getDb().execute('DELETE FROM words WHERE id = ?', [id]);
  notifyChanged('words');
}
