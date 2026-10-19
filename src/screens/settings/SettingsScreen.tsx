import React from 'react';
import { ScrollView } from 'react-native';
import { Check, Download, Upload } from 'lucide-react-native';
import { ListRow } from '../../components/ListRow';
import { SectionHeader } from '../../components/SectionHeader';
import { useSettingsStore } from '../../store/settingsStore';
import { useAppTheme } from '../../theme/ThemeProvider';
import type { ThemeMode } from '../../domain/types';

const THEME_OPTIONS: Array<{ mode: ThemeMode; label: string }> = [
  { mode: 'system', label: 'System default' },
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
];

export function SettingsScreen() {
  const { colors } = useAppTheme();
  const themeMode = useSettingsStore(s => s.themeMode);
  const setThemeMode = useSettingsStore(s => s.setThemeMode);

  return (
    <ScrollView>
      <SectionHeader title="Appearance" />
      {THEME_OPTIONS.map(({ mode, label }) => (
        <ListRow
          key={mode}
          title={label}
          onPress={() => setThemeMode(mode)}
          right={
            mode === themeMode ? (
              <Check color={colors.primary} size={22} />
            ) : null
          }
        />
      ))}

      <SectionHeader title="Backup" />
      <ListRow
        title="Export"
        subtitle="Save all languages, folders, sets and words to a file"
        // TODO(step 4): build BackupFile JSON and open the share/save dialog
        right={<Upload color={colors.textSecondary} size={20} />}
      />
      <ListRow
        title="Import"
        subtitle="Merge words from a backup file"
        // TODO(step 4): pick file, validate, merge by (language, term)
        right={<Download color={colors.textSecondary} size={20} />}
      />
    </ScrollView>
  );
}
