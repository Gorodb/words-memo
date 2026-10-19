import { create } from 'zustand';
import { BUNDLED_LANGUAGES, DEFAULT_LANGUAGE_CODE } from '../config/languages';
import { readSettings, writeSetting } from '../db/repositories/settings';
import type { LanguageCode, ThemeMode } from '../domain/types';

interface SettingsState {
  themeMode: ThemeMode;
  activeLanguage: LanguageCode;
  setThemeMode: (mode: ThemeMode) => void;
  setActiveLanguage: (code: LanguageCode) => void;
}

const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark'];

export const useSettingsStore = create<SettingsState>(set => ({
  themeMode: 'system',
  activeLanguage: DEFAULT_LANGUAGE_CODE,
  setThemeMode: themeMode => {
    writeSetting('themeMode', themeMode);
    set({ themeMode });
  },
  setActiveLanguage: activeLanguage => {
    writeSetting('activeLanguage', activeLanguage);
    set({ activeLanguage });
  },
}));

/** Loads persisted settings into the store. Call after initDatabase(). */
export function hydrateSettings(): void {
  const saved = readSettings();
  const themeMode = THEME_MODES.find(m => m === saved.themeMode);
  // TODO(step 5): also accept installed (downloaded) languages.
  const activeLanguage = BUNDLED_LANGUAGES.find(
    l => l.code === saved.activeLanguage,
  )?.code;
  useSettingsStore.setState({
    ...(themeMode && { themeMode }),
    ...(activeLanguage && { activeLanguage }),
  });
}
