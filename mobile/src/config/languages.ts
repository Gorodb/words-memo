import type { Language, LanguageCode } from '../domain/types';
import { SYNC_API_URL } from './sync';

/** Languages available out of the box. Their dictionaries are downloaded separately. */
export const BUNDLED_LANGUAGES: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
];

export const DEFAULT_LANGUAGE_CODE = 'en';

export interface DictionaryInfo {
  url: string;
  /** Approximate download size, for the UI. */
  sizeMB: number;
}

/**
 * <lang>-ru dictionaries built by `npm run dict:build` (Russian Wiktionary)
 * are served by our backend (`GET /dictionaries/<lang>-ru.db`, see
 * backend/README.md for uploading them). No account needed to download.
 */
const DICTIONARY_BASE = `${SYNC_API_URL}/dictionaries`;

/** Bundled languages missing here have no dictionary: no download, no suggestions. */
export const DICTIONARIES: Partial<Record<LanguageCode, DictionaryInfo>> = {
  en: { url: `${DICTIONARY_BASE}/en-ru.db`, sizeMB: 14 },
  de: { url: `${DICTIONARY_BASE}/de-ru.db`, sizeMB: 18 },
};

/** Must match FORMAT_VERSION in scripts/dictionary/schema.ts. */
export const DICTIONARY_FORMAT = 1;

export const DICTIONARY_ATTRIBUTION =
  'Dictionaries: Wiktionary (CC BY-SA 4.0), extracted by kaikki.org / wiktextract.';
