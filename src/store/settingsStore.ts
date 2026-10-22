import { create } from 'zustand';
import { BUNDLED_LANGUAGES, DEFAULT_LANGUAGE_CODE } from '../config/languages';
import {
  createLanguage,
  deleteLanguage,
  listCustomLanguages,
  renameLanguage,
} from '../db/repositories/languages';
import { readSettings, writeSetting } from '../db/repositories/settings';
import { findLanguageByName } from '../domain/languages';
import type { Language, LanguageCode, ThemeMode } from '../domain/types';

interface SettingsState {
  themeMode: ThemeMode;
  activeLanguage: LanguageCode;
  /** Bundled languages, then the ones the user added. */
  languages: Language[];
  setThemeMode: (mode: ThemeMode) => void;
  setActiveLanguage: (code: LanguageCode) => void;
  /** Throws a readable error if the name is taken. */
  addLanguage: (name: string) => Promise<Language>;
  renameLanguage: (code: LanguageCode, name: string) => Promise<void>;
  /** Deletes a custom language with all its data. */
  removeLanguage: (code: LanguageCode) => Promise<void>;
  /** Re-reads custom languages (after an import created some). */
  reloadLanguages: () => void;
}

const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark'];

const loadLanguages = () => [...BUNDLED_LANGUAGES, ...listCustomLanguages()];

function checkNameFree(
  languages: Language[],
  name: string,
  exceptCode?: LanguageCode,
): void {
  const taken = findLanguageByName(languages, name);
  if (taken && taken.code !== exceptCode) {
    throw new Error(`There is already a language called "${taken.name}".`);
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  themeMode: 'system',
  activeLanguage: DEFAULT_LANGUAGE_CODE,
  languages: BUNDLED_LANGUAGES,
  setThemeMode: themeMode => {
    writeSetting('themeMode', themeMode);
    set({ themeMode });
  },
  setActiveLanguage: activeLanguage => {
    writeSetting('activeLanguage', activeLanguage);
    set({ activeLanguage });
  },
  addLanguage: async name => {
    checkNameFree(get().languages, name);
    const language = await createLanguage(name);
    set(state => ({ languages: [...state.languages, language] }));
    return language;
  },
  renameLanguage: async (code, name) => {
    checkNameFree(get().languages, name, code);
    await renameLanguage(code, name);
    get().reloadLanguages();
  },
  removeLanguage: async code => {
    if (!get().languages.find(l => l.code === code)?.custom) {
      return; // bundled languages can't be removed
    }
    await deleteLanguage(code);
    if (get().activeLanguage === code) {
      get().setActiveLanguage(DEFAULT_LANGUAGE_CODE);
    }
    get().reloadLanguages();
  },
  reloadLanguages: () => set({ languages: loadLanguages() }),
}));

/** Loads persisted settings into the store. Call after initDatabase(). */
export function hydrateSettings(): void {
  const saved = readSettings();
  const languages = loadLanguages();
  const themeMode = THEME_MODES.find(m => m === saved.themeMode);
  const activeLanguage = languages.find(
    l => l.code === saved.activeLanguage,
  )?.code;
  useSettingsStore.setState({
    languages,
    ...(themeMode && { themeMode }),
    ...(activeLanguage && { activeLanguage }),
  });
}
