import type { Language, LanguageCode } from '../domain/types';

/** Languages available out of the box. Their dictionaries are downloaded separately. */
export const BUNDLED_LANGUAGES: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
];

export const DEFAULT_LANGUAGE_CODE = 'en';

export interface DictionaryInfo {
  url: string;
  /** Approximate download size, for the UI. */
  sizeMB: number;
}

/**
 * <lang>-ru dictionaries built by `npm run dict:build` (Russian Wiktionary)
 * and uploaded as assets of a GitHub Release.
 */
const DICTIONARY_RELEASE =
  'https://github.com/Gorodb/words-memo/releases/download/dict-v1';

/** Languages missing here (zh) have no dictionary yet: no download, no suggestions. */
export const DICTIONARIES: Partial<Record<LanguageCode, DictionaryInfo>> = {
  en: { url: `${DICTIONARY_RELEASE}/en-ru.db`, sizeMB: 14 },
  de: { url: `${DICTIONARY_RELEASE}/de-ru.db`, sizeMB: 18 },
};

/** Must match FORMAT_VERSION in scripts/dictionary/schema.ts. */
export const DICTIONARY_FORMAT = 1;

export const DICTIONARY_ATTRIBUTION =
  'Dictionaries: Wiktionary (CC BY-SA 4.0), extracted by kaikki.org / wiktextract.';
