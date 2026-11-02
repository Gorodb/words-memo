// Copied from the app (src/domain/languages.ts); keep both in step.
import type { Language } from './types.ts';

const key = (name: string) => name.trim().normalize('NFC').toLocaleLowerCase();

/** Language whose English or native name matches, ignoring case and spaces around. */
export function findLanguageByName(
  languages: Language[],
  name: string,
): Language | undefined {
  const k = key(name);
  return languages.find(l => key(l.name) === k || key(l.nativeName) === k);
}
