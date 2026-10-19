import React from 'react';
import { FlatList } from 'react-native';
import { Check, Download } from 'lucide-react-native';
import { ListRow } from '../../components/ListRow';
import { BUNDLED_LANGUAGES } from '../../config/languages';
import { useSettingsStore } from '../../store/settingsStore';
import { useAppTheme } from '../../theme/ThemeProvider';

export function LanguagesScreen() {
  const { colors } = useAppTheme();
  const activeLanguage = useSettingsStore(s => s.activeLanguage);
  const setActiveLanguage = useSettingsStore(s => s.setActiveLanguage);

  // TODO(step 5): merge BUNDLED_LANGUAGES with installed ones from the DB.
  return (
    <FlatList
      data={BUNDLED_LANGUAGES}
      keyExtractor={item => item.code}
      renderItem={({ item }) => (
        <ListRow
          title={item.name}
          subtitle={`${item.nativeName} → Русский`}
          onPress={() => setActiveLanguage(item.code)}
          right={
            item.code === activeLanguage ? (
              <Check color={colors.primary} size={22} />
            ) : null
          }
        />
      )}
      ListFooterComponent={
        <ListRow
          title="Download more languages"
          subtitle="Coming soon"
          // TODO(step 5): open dictionary catalog
          right={<Download color={colors.textSecondary} size={20} />}
        />
      }
    />
  );
}
