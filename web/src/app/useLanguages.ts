import { useGetLanguagesQuery } from '../api/api';
import type { LanguageView } from '../api/types';
import { useAppSelector } from '../store';

const FALLBACK: LanguageView[] = [
  { code: 'en', name: 'English', nativeName: 'English', custom: false },
  { code: 'de', name: 'German', nativeName: 'Deutsch', custom: false },
];

/** Bundled languages, then the user's own (from the server). */
export function useLanguages(): LanguageView[] {
  return useGetLanguagesQuery().data ?? FALLBACK;
}

/** The active language; the first one if it was deleted (e.g. on another device). */
export function useActiveLanguage(): LanguageView {
  const languages = useLanguages();
  const code = useAppSelector(s => s.settings.activeLanguage);
  return languages.find(l => l.code === code) ?? languages[0];
}

export function useLanguageName(code: string | undefined): string | undefined {
  return useLanguages().find(l => l.code === code)?.name;
}
