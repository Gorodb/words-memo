/**
 * Pure rules of the user's library, the same as the app's repositories
 * (`src/db/repositories/*.ts` there), so the website and the phone order and
 * edit things the same way. No TypeORM here: unit tested with `node --test`.
 */
import { randomBytes } from 'node:crypto';
import type { WordRecord } from '../sync/protocol.ts';

/** Languages available out of the box (the app's `config/languages.ts`). */
export const BUNDLED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
];

/** Codes of custom languages start with this, so they never clash with ISO codes. */
export const CUSTOM_LANGUAGE_PREFIX = 'x-';

/** At most this many folders, and this many sets, can be pinned per language. */
export const MAX_PINNED = 5;

/** Same shape as the app's ids: time-ordered prefix + random suffix. */
export function createId(): string {
  return (
    Date.now().toString(36) +
    randomBytes(6).toString('base64url').replace(/[-_]/g, '0').slice(0, 8).toLowerCase()
  );
}

const nameKey = (name: string) =>
  name.trim().normalize('NFC').toLocaleLowerCase();

/** Whether a language name is taken (English or native name, ignoring case). */
export function languageNameTaken(
  languages: Array<{ code: string; name: string; nativeName?: string }>,
  name: string,
  exceptCode?: string,
): { code: string; name: string } | null {
  const key = nameKey(name);
  return (
    languages.find(
      l =>
        l.code !== exceptCode &&
        (nameKey(l.name) === key || nameKey(l.nativeName ?? l.name) === key),
    ) ?? null
  );
}

/** "To learn" first, then learned; starred first in each part; then by sort key. */
export function compareWords(a: WordRecord, b: WordRecord): number {
  return (
    Number(a.learnedAt !== null) - Number(b.learnedAt !== null) ||
    Number(a.favoriteAt === null) - Number(b.favoriteAt === null) ||
    b.sortAt - a.sortAt ||
    b.createdAt - a.createdAt ||
    (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
  );
}

/** Drag group of a word: a word is only reordered among words of its group. */
export const wordGroup = (w: Pick<WordRecord, 'learnedAt' | 'favoriteAt'>) =>
  (w.learnedAt === null ? 0 : 2) + (w.favoriteAt === null ? 1 : 0);

/** A sort key above every word of the set: the word goes to the top of its group. */
export function nextSortAt(setWords: Array<{ sortAt: number }>, now: number): number {
  return Math.max(now, Math.max(0, ...setWords.map(w => w.sortAt)) + 1);
}

/**
 * New sort keys for a manual order (the app's `reorderWords`): `orderedIds[0]`
 * on top, consecutive keys counting down from the group's highest one, so
 * words added later still land above them.
 */
export function reorderedSortKeys(
  words: Array<{ id: string; sortAt: number }>,
  orderedIds: string[],
): Map<string, number> {
  const byId = new Map(words.map(w => [w.id, w]));
  const ids = orderedIds.filter(id => byId.has(id));
  const top = Math.max(0, ...ids.map(id => byId.get(id)!.sortAt));
  return new Map(ids.map((id, i) => [id, top - i]));
}

/** Example pairs from untrusted input, without blank example texts. */
export function cleanExamples(
  examples: Array<{ text?: unknown; translation?: unknown }> | undefined,
): Array<{ text: string; translation: string }> {
  return (examples ?? [])
    .map(e => ({
      text: String(e?.text ?? '').trim(),
      translation: String(e?.translation ?? '').trim(),
    }))
    .filter(e => e.text !== '');
}
