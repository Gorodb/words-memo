import { BUNDLED_LANGUAGES } from '../config/languages';
import type { Language } from '../domain/types';
import { useSettingsStore } from './settingsStore';

/** Full Language object for the currently selected language. */
export function useActiveLanguage(): Language {
  const code = useSettingsStore(s => s.activeLanguage);
  return BUNDLED_LANGUAGES.find(l => l.code === code) ?? BUNDLED_LANGUAGES[0];
}
