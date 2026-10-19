/**
 * Core domain model. Storage-agnostic: the DB layer (SQLite) maps rows to these types.
 */

export type ID = string;
/** ISO-639-1 code of the language being learned, e.g. "en", "de". */
export type LanguageCode = string;
/** Milliseconds since epoch. */
export type Timestamp = number;

export type DictionaryStatus =
  | 'bundled' // shipped with the app (en, de)
  | 'installed' // downloaded by the user
  | 'available'; // can be downloaded from the catalog

export interface Language {
  code: LanguageCode;
  /** English name, e.g. "German". */
  name: string;
  /** Native name, e.g. "Deutsch". */
  nativeName: string;
  dictionaryStatus: DictionaryStatus;
}

/** A user-ordered group that pins any number of sets of its language. */
export interface Folder {
  id: ID;
  languageCode: LanguageCode;
  name: string;
  /** Manual sort order within the language (drag and drop). */
  position: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Sets exist on their own (per language). A set can be pinned to several
 * folders; removing a folder only unpins its sets.
 */
export interface WordSet {
  id: ID;
  languageCode: LanguageCode;
  name: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Word {
  id: ID;
  setId: ID;
  languageCode: LanguageCode;
  /** Word or phrase in the learned language. */
  term: string;
  /** Russian translation. */
  translation: string;
  /** Any number of usage examples, typed or pasted. */
  examples: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Editable part of a Word (what the word form produces). */
export type WordInput = Pick<Word, 'term' | 'translation' | 'examples'>;

export type ThemeMode = 'system' | 'light' | 'dark';

/** Shape of an exported backup file. Versioned so the format can evolve. */
export interface BackupFile {
  app: 'wordsLearning';
  version: 1;
  exportedAt: Timestamp;
  languages: Array<{
    code: LanguageCode;
    /** Folders in manual order; each lists the names of its pinned sets. */
    folders: Array<
      Pick<Folder, 'name' | 'createdAt' | 'updatedAt'> & { setNames: string[] }
    >;
    sets: Array<
      Pick<WordSet, 'name' | 'createdAt' | 'updatedAt'> & {
        words: Array<
          Pick<
            Word,
            'term' | 'translation' | 'examples' | 'createdAt' | 'updatedAt'
          >
        >;
      }
    >;
  }>;
}
