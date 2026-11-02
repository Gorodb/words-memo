/** Response shapes of the backend's library routes (backend/src/library). */
import type { ImportSummary } from '../features/backup/summary';
import type { Folder, Language, Rule, Word, WordSet } from '../domain/types';

export type LanguageView = Language & { custom: boolean };
export type FolderView = Folder & { setCount: number };
export type FolderDetail = FolderView & { setIds: string[] };
export type SetView = WordSet & { wordCount: number; ruleCount: number };
export type WordView = Word;
export type RuleView = Rule;

export interface WordInput {
  term: string;
  translation: string;
  examples: Array<{ text: string; translation: string }>;
  description?: string;
}

export interface WordPatch extends Partial<WordInput> {
  learned?: boolean;
  favorite?: boolean;
}

export interface ImportPreview {
  summary: ImportSummary;
  setNames: string[];
  languageCodes: string[];
}

export interface ShareCreated {
  code: string;
  expiresAt: string;
}

export interface DictionaryEntry {
  id: number;
  lemma: string;
  pos: string;
  display: string;
  glosses: string[];
}

export interface Session {
  token: string;
  user: { id: string; email: string };
}
