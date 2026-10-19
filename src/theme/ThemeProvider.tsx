import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import {
  DarkTheme,
  DefaultTheme,
  type Theme as NavigationTheme,
} from '@react-navigation/native';
import { useSettingsStore } from '../store/settingsStore';
import { darkColors, lightColors, type AppColors } from './colors';

interface AppTheme {
  isDark: boolean;
  colors: AppColors;
  navigationTheme: NavigationTheme;
}

const ThemeContext = createContext<AppTheme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const themeMode = useSettingsStore(s => s.themeMode);
  const isDark =
    themeMode === 'system' ? systemScheme === 'dark' : themeMode === 'dark';

  const value = useMemo<AppTheme>(() => {
    const colors = isDark ? darkColors : lightColors;
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      isDark,
      colors,
      navigationTheme: {
        ...base,
        colors: {
          ...base.colors,
          primary: colors.primary,
          background: colors.background,
          card: colors.surface,
          text: colors.text,
          border: colors.border,
          notification: colors.danger,
        },
      },
    };
  }, [isDark]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useAppTheme(): AppTheme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useAppTheme must be used inside ThemeProvider');
  }
  return theme;
}
