/// <reference types="node" />
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '../..');
export const SOURCE_DIR = path.join(ROOT, 'dictionaries', 'source');
export const BUILD_DIR = path.join(ROOT, 'dictionaries', 'build');

/** Both from kaikki.org (wiktextract), CC-BY-SA 4.0 / GFDL like Wiktionary. */
export const SOURCES = {
  /** Russian Wiktionary, all languages: glosses, forms, examples. */
  ruwiktionary: {
    url: 'https://kaikki.org/ruwiktionary/raw-wiktextract-data.jsonl.gz',
    file: path.join(SOURCE_DIR, 'ruwiktionary-raw.jsonl.gz'),
  },
  /** English Wiktionary, German only: verb auxiliaries, adjective comparison. */
  enwiktionaryGerman: {
    url: 'https://kaikki.org/dictionary/German/kaikki.org-dictionary-German.jsonl',
    file: path.join(SOURCE_DIR, 'enwiktionary-german.jsonl'),
  },
};

/** Languages to build (`<code>-ru.db`). */
export const LANGUAGES = ['de', 'en'] as const;

