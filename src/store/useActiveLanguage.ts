import type { Language } from '../domain/types';
import { useSettingsStore } from './settingsStore';

/** Full Language object for the currently selected language. */
export function useActiveLanguage(): Language {
  const code = useSettingsStore(s => s.activeLanguage);
  const languages = useSettingsStore(s => s.languages);
  return languages.find(l => l.code === code) ?? languages[0];
}
