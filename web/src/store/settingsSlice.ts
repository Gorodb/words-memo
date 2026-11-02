import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { LanguageCode, ThemeMode } from '../domain/types';

/** Per-browser settings: not synced (like on the phone). */
export interface SettingsState {
  themeMode: ThemeMode;
  activeLanguage: LanguageCode;
}

export const initialSettingsState: SettingsState = {
  themeMode: 'system',
  activeLanguage: 'en',
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState: initialSettingsState,
  reducers: {
    hydrate: (_state, action: PayloadAction<SettingsState>) => action.payload,
    themeModeChanged(state, action: PayloadAction<ThemeMode>) {
      state.themeMode = action.payload;
    },
    activeLanguageChanged(state, action: PayloadAction<LanguageCode>) {
      state.activeLanguage = action.payload;
    },
  },
});

export const settingsActions = settingsSlice.actions;
export const settingsReducer = settingsSlice.reducer;
