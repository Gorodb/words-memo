/// <reference types="node" />
/**
 * Dictionary DB schema + writer, shared by build.ts and the tests.
 * The app reads it in src/features/dictionary/queries.ts.
 */
import type { DatabaseSync } from 'node:sqlite';
import { searchKey } from '../../src/features/dictionary/searchKey.ts';
import type { DictEntry } from './format.ts';

/** Bump when the schema changes; must match DICTIONARY_FORMAT in src/config/languages.ts. */
export const FORMAT_VERSION = 1;

/** Most useful parts of speech first when several entries match. */
const POS_RANK: Record<string, number> = {
  noun: 0,
  verb: 1,
  adj: 2,
  adv: 3,
  phrase: 4,
};

export function writeEntries(
  db: DatabaseSync,
  language: string,
  entries: DictEntry[],
): void {
  db.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    CREATE TABLE entries (
      id INTEGER PRIMARY KEY,
      lemma TEXT NOT NULL,
      lemma_key TEXT NOT NULL,
      pos TEXT NOT NULL,
      rank INTEGER NOT NULL,
      display TEXT NOT NULL,
      glosses_json TEXT NOT NULL,
      examples_json TEXT NOT NULL
    );
    CREATE TABLE keys (key TEXT NOT NULL, entry_id INTEGER NOT NULL);
  `);
  const meta = db.prepare('INSERT INTO meta VALUES (?, ?)');
  for (const [key, value] of Object.entries({
    format: String(FORMAT_VERSION),
    language,
    builtAt: new Date().toISOString(),
    source:
      'Russian Wiktionary + English Wiktionary (German grammar), via kaikki.org/wiktextract',
    license: 'CC BY-SA 4.0 / GFDL',
  })) {
    meta.run(key, value);
  }
  const insertEntry = db.prepare(
    'INSERT INTO entries (id, lemma, lemma_key, pos, rank, display, glosses_json, examples_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const insertKey = db.prepare('INSERT INTO keys VALUES (?, ?)');
  db.exec('BEGIN');
  entries.forEach((entry, i) => {
    const id = i + 1;
    insertEntry.run(
      id,
      entry.lemma,
      searchKey(entry.lemma),
      entry.pos,
      POS_RANK[entry.pos] ?? 9,
      entry.display,
      JSON.stringify(entry.glosses),
      JSON.stringify(entry.examples),
    );
    for (const key of entry.keys) {
      insertKey.run(key, id);
    }
  });
  db.exec('COMMIT');
  db.exec('CREATE INDEX idx_keys_key ON keys (key)');
}
