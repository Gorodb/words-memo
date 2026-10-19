import type { Scalar } from '@op-engineering/op-sqlite';
import { prefixEnd, searchKey } from './searchKey.ts';

/** Minimal DB surface shared by op-sqlite (app) and the node:sqlite test adapter. */
export interface DictionaryDb {
  execute: (
    query: string,
    params?: Scalar[],
  ) => Promise<{ rows: Array<Record<string, Scalar>> }>;
}

export interface DictionaryEntry {
  id: number;
  lemma: string;
  pos: string;
  /** Text for the word field, e.g. "der Apfel, die Äpfel". */
  display: string;
  /** Russian translations, one per sense. */
  glosses: string[];
  examples: Array<{ text: string; translation: string }>;
}

export const MAX_RESULTS = 8;

function toEntry(row: Record<string, Scalar>): DictionaryEntry {
  return {
    id: row.id as number,
    lemma: row.lemma as string,
    pos: row.pos as string,
    display: row.display as string,
    glosses: JSON.parse(row.glosses_json as string),
    examples: JSON.parse(row.examples_json as string),
  };
}

/**
 * Prefix search over lemmas and all their forms ("isst" finds essen).
 * Order: lemma typed exactly (case-sensitive, so "essen" → verb, "Essen" →
 * noun), then lemma match, then exact form match, then part of speech and length.
 */
export async function searchEntries(
  db: DictionaryDb,
  text: string,
  limit = MAX_RESULTS,
): Promise<DictionaryEntry[]> {
  const raw = text.trim().replace(/\s+/g, ' ').normalize('NFC');
  const key = searchKey(raw);
  if (!key) {
    return [];
  }
  const { rows } = await db.execute(
    `SELECT e.*, MAX(k.key = ?) AS exact
     FROM keys k JOIN entries e ON e.id = k.entry_id
     WHERE k.key >= ? AND k.key < ?
     GROUP BY e.id
     ORDER BY (e.lemma = ?) DESC, (e.lemma_key = ?) DESC, exact DESC, e.rank, length(e.lemma), e.id
     LIMIT ?`,
    [key, key, prefixEnd(key), raw, key, limit],
  );
  return rows.map(toEntry);
}

export async function getEntry(
  db: DictionaryDb,
  id: number,
): Promise<DictionaryEntry | null> {
  const { rows } = await db.execute('SELECT * FROM entries WHERE id = ?', [id]);
  return rows[0] ? toEntry(rows[0]) : null;
}

/**
 * Entries whose lemma or form equals the main form of a typed term:
 * "der Apfel, die Äpfel" → "Apfel", "essen, isst, …" → "essen".
 */
export async function findExact(
  db: DictionaryDb,
  term: string,
): Promise<DictionaryEntry[]> {
  const main = mainForm(term);
  if (!main) {
    return [];
  }
  const key = searchKey(main);
  const { rows } = await db.execute(
    `SELECT DISTINCT e.* FROM keys k JOIN entries e ON e.id = k.entry_id
     WHERE k.key = ?
     ORDER BY (e.lemma = ?) DESC, e.rank, e.id
     LIMIT ?`,
    [key, main, MAX_RESULTS],
  );
  return rows.map(toEntry);
}

/** First comma part without a leading German article. */
export function mainForm(term: string): string {
  return term
    .split(',')[0]
    .trim()
    .replace(/^(der|die|das)\s+/i, '')
    .trim();
}
