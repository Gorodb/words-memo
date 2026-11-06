import type { Language } from './types';

const key = (name: string) => name.trim().normalize('NFC').toLocaleLowerCase();

/** Language whose English or native name matches, ignoring case and spaces around. */
export function findLanguageByName(
  languages: Language[],
  name: string,
): Language | undefined {
  const k = key(name);
  return languages.find(l => key(l.name) === k || key(l.nativeName) === k);
}
