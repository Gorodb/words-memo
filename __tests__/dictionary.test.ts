/**
 * Dictionary build + lookup on real (trimmed) Wiktionary lines from
 * test-utils/fixtures, using the same schema writer and queries as the
 * build script and the app.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  germanExtrasFrom,
  toDictEntry,
  type DictEntry,
  type GermanExtras,
  type RawEntry,
} from '../scripts/dictionary/format';
import { writeEntries } from '../scripts/dictionary/schema';
import {
  findExact,
  mainForm,
  searchEntries,
  type DictionaryDb,
} from '../src/features/dictionary/queries';
import { foldedKey, searchKey } from '../src/features/dictionary/searchKey';

const fixture = (name: string) =>
  fs
    .readFileSync(path.join(__dirname, '../test-utils/fixtures', name), 'utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));

const extras = new Map<string, GermanExtras>();
for (const raw of fixture('enwiktionary-german.jsonl')) {
  const found = germanExtrasFrom(raw);
  if (found) {
    extras.set(`${raw.word}|${raw.pos}`, found);
  }
}

const entriesByLanguage: Record<string, DictEntry[]> = { de: [], en: [] };
for (const raw of fixture('ruwiktionary.jsonl') as RawEntry[]) {
  const entry = toDictEntry(
    raw,
    raw.lang_code === 'de' ? extras.get(`${raw.word}|${raw.pos}`) : undefined,
  );
  if (entry) {
    entriesByLanguage[raw.lang_code!].push(entry);
  }
}

function dictionary(language: 'de' | 'en'): DictionaryDb {
  const db = new DatabaseSync(':memory:');
  writeEntries(db, language, entriesByLanguage[language]);
  return {
    execute: async (query, params = []) => ({
      rows: db.prepare(query).all(...(params as never[])) as never,
    }),
  };
}

const display = (language: string, lemma: string, pos: string) =>
  entriesByLanguage[language].find(e => e.lemma === lemma && e.pos === pos)
    ?.display;

describe('display forms', () => {
  test('German nouns get article and plural', () => {
    expect(display('de', 'Apfel', 'noun')).toBe('der Apfel, die Äpfel');
    expect(display('de', 'Haus', 'noun')).toBe('das Haus, die Häuser');
  });

  test('German verbs get principal parts with the right auxiliary', () => {
    expect(display('de', 'essen', 'verb')).toBe('essen, isst, aß, hat gegessen');
    expect(display('de', 'gehen', 'verb')).toBe(
      'gehen, geht, ging, ist gegangen',
    );
    expect(display('de', 'fahren', 'verb')).toBe(
      'fahren, fährt, fuhr, hat/ist gefahren',
    );
  });

  test('German adjectives get comparison', () => {
    expect(display('de', 'schnell', 'adj')).toBe(
      'schnell, schneller, am schnellsten',
    );
    expect(display('de', 'gut', 'adj')).toBe('gut, besser, am besten');
  });

  test('English: irregular verbs get principal parts, regular ones do not', () => {
    expect(display('en', 'go', 'verb')).toBe('go, went, gone');
    expect(display('en', 'apple', 'verb')).toBe('apple');
    expect(display('en', 'apple', 'noun')).toBe('apple');
  });

  test('form-of stubs are skipped and glosses are Russian', () => {
    const essen = entriesByLanguage.de.filter(e => e.lemma === 'essen');
    expect(essen).toHaveLength(1);
    expect(essen[0].glosses[0]).toBe('есть, кушать');
    expect(essen[0].examples[0]).toEqual({
      text: 'Ich esse einen Apfel.',
      translation: 'Я ем яблоко.',
    });
  });
});

describe('lookup', () => {
  const de = dictionary('de');
  const en = dictionary('en');
  const displays = async (db: DictionaryDb, text: string) =>
    (await searchEntries(db, text)).map(e => e.display);

  test('prefix search on lemma and forms, with and without umlauts', async () => {
    expect(await displays(de, 'Apf')).toContain('der Apfel, die Äpfel');
    expect(await displays(de, 'äpfel')).toEqual(['der Apfel, die Äpfel']);
    expect(await displays(de, 'apfeln')).toEqual(['der Apfel, die Äpfel']);
    expect(await displays(de, 'isst')).toEqual([
      'essen, isst, aß, hat gegessen',
    ]);
    expect(await displays(en, 'went')).toEqual(['go, went, gone']);
    expect(await displays(de, 'x')).toEqual([]);
  });

  test('exact lookup by the main form of a stored term', async () => {
    expect(mainForm('der Apfel, die Äpfel')).toBe('Apfel');
    expect(mainForm('essen, isst, aß, hat gegessen')).toBe('essen');
    const [entry] = await findExact(de, 'der Apfel, die Äpfel');
    expect(entry.glosses[0]).toBe('яблоко');
  });

  test('search keys', () => {
    expect(searchKey('  Der   Apfel ')).toBe('der apfel');
    expect(foldedKey('Äpfel')).toBe('apfel');
    expect(foldedKey('Straße')).toBe('strasse');
  });
});
