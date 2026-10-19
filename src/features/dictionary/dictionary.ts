import { open, type DB } from '@op-engineering/op-sqlite';
import { DocumentDirectoryPath } from '@dr.pogodin/react-native-fs';
import type { LanguageCode } from '../../domain/types';
import {
  findExact,
  getEntry,
  searchEntries,
  type DictionaryEntry,
} from './queries';

/** Downloaded dictionaries live next to each other in the app's documents folder. */
export const DICTIONARY_DIR = `${DocumentDirectoryPath}/dictionaries`;

export const dictionaryFileName = (language: LanguageCode) =>
  `${language}-ru.db`;

export const dictionaryPath = (language: LanguageCode) =>
  `${DICTIONARY_DIR}/${dictionaryFileName(language)}`;

const connections = new Map<LanguageCode, DB>();

/** Opens (once) the installed dictionary of a language. */
export function openDictionary(language: LanguageCode): DB {
  let db = connections.get(language);
  if (!db) {
    db = open({
      name: dictionaryFileName(language),
      location: DICTIONARY_DIR,
    });
    connections.set(language, db);
  }
  return db;
}

export function closeDictionary(language: LanguageCode): void {
  connections.get(language)?.close();
  connections.delete(language);
}

export function suggestEntries(
  language: LanguageCode,
  text: string,
): Promise<DictionaryEntry[]> {
  return searchEntries(openDictionary(language), text);
}

export function dictionaryEntry(
  language: LanguageCode,
  id: number,
): Promise<DictionaryEntry | null> {
  return getEntry(openDictionary(language), id);
}

export function exactEntries(
  language: LanguageCode,
  term: string,
): Promise<DictionaryEntry[]> {
  return findExact(openDictionary(language), term);
}
