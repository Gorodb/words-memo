/// <reference types="node" />
/**
 * Builds dictionaries/build/<lang>-ru.db from the Wiktionary sources
 * (run `npm run dict:fetch` first). Schema: see schema.ts.
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
} from './format.ts';
import { jsonlLines } from './jsonl.ts';
import { writeEntries } from './schema.ts';
import { BUILD_DIR, LANGUAGES, SOURCES } from './sources.ts';

async function loadGermanExtras(): Promise<Map<string, GermanExtras>> {
  const extras = new Map<string, GermanExtras>();
  for await (const line of jsonlLines(SOURCES.enwiktionaryGerman.file)) {
    const raw = JSON.parse(line);
    const found = germanExtrasFrom(raw);
    if (found && !extras.has(`${raw.word}|${raw.pos}`)) {
      extras.set(`${raw.word}|${raw.pos}`, found);
    }
  }
  return extras;
}

async function collectEntries(
  germanExtras: Map<string, GermanExtras>,
): Promise<Record<string, DictEntry[]>> {
  const result: Record<string, DictEntry[]> = Object.fromEntries(
    LANGUAGES.map(l => [l, []]),
  );
  const wanted = new Set<string>(LANGUAGES);
  for await (const line of jsonlLines(SOURCES.ruwiktionary.file)) {
    // Cheap pre-filter before parsing ~2.5 GB of JSON.
    if (!/"lang_code": ?"(de|en)"/.test(line)) {
      continue;
    }
    const raw = JSON.parse(line) as RawEntry;
    if (!raw.lang_code || !wanted.has(raw.lang_code)) {
      continue;
    }
    const extras =
      raw.lang_code === 'de'
        ? germanExtras.get(`${raw.word}|${raw.pos}`)
        : undefined;
    const entry = toDictEntry(raw, extras);
    if (entry) {
      result[raw.lang_code].push(entry);
    }
  }
  return result;
}

function writeDictionary(language: string, entries: DictEntry[]): string {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  const file = path.join(BUILD_DIR, `${language}-ru.db`);
  fs.rmSync(file, { force: true });
  const db = new DatabaseSync(file);
  writeEntries(db, language, entries);
  db.exec('VACUUM');
  db.close();
  return file;
}

const started = Date.now();
console.log('reading German grammar (English Wiktionary)…');
const germanExtras = await loadGermanExtras();
console.log(`  ${germanExtras.size} verbs/adjectives with extras`);
console.log('reading Russian Wiktionary…');
const byLanguage = await collectEntries(germanExtras);
for (const language of LANGUAGES) {
  const file = writeDictionary(language, byLanguage[language]);
  console.log(
    `${path.basename(file)}: ${byLanguage[language].length} entries, ${(
      fs.statSync(file).size / 1e6
    ).toFixed(1)} MB`,
  );
}
console.log(`done in ${((Date.now() - started) / 1000).toFixed(0)} s`);
