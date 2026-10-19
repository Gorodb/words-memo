import React from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { ListRow } from '../../components/ListRow';
import { TextButton } from '../../components/TextButton';
import { BUNDLED_LANGUAGES, DICTIONARIES } from '../../config/languages';
import type { Language } from '../../domain/types';
import {
  useDictionaryStore,
  type DictionaryStatus,
} from '../../features/dictionary/dictionaryStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useAppTheme } from '../../theme/ThemeProvider';

function dictionarySubtitle(
  language: Language,
  status: DictionaryStatus | undefined,
): string {
  const size = DICTIONARIES[language.code]?.sizeMB;
  const base = `${language.nativeName} → Русский`;
  switch (status?.state) {
    case 'installed':
      return `${base} · dictionary installed`;
    case 'downloading':
      return `${base} · downloading ${Math.round(status.progress * 100)}%`;
    case 'error':
      return `${base} · dictionary error: ${status.message}`;
    case 'missing':
      return `${base} · dictionary not installed${size ? ` (${size} MB)` : ''}`;
    default:
      return `${base} · checking dictionary…`;
  }
}

export function LanguagesScreen() {
  const { colors } = useAppTheme();
  const activeLanguage = useSettingsStore(s => s.activeLanguage);
  const setActiveLanguage = useSettingsStore(s => s.setActiveLanguage);
  const statuses = useDictionaryStore(s => s.statuses);
  const download = useDictionaryStore(s => s.download);
  const remove = useDictionaryStore(s => s.remove);

  const dictionaryButton = (language: Language) => {
    const status = statuses[language.code];
    if (!DICTIONARIES[language.code]) {
      return null;
    }
    switch (status?.state) {
      case 'missing':
      case 'error':
        return (
          <TextButton
            title={status.state === 'error' ? 'Retry' : 'Download'}
            onPress={() => download(language.code)}
          />
        );
      case 'installed':
        return (
          <TextButton
            title="Remove"
            variant="secondary"
            onPress={() =>
              Alert.alert(
                `Remove the ${language.name} dictionary?`,
                'Your words stay. Suggestions stop until you download it again.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () => remove(language.code),
                  },
                ],
              )
            }
          />
        );
      default:
        return null;
    }
  };

  return (
    <FlatList
      data={BUNDLED_LANGUAGES}
      keyExtractor={item => item.code}
      renderItem={({ item }) => (
        <ListRow
          title={item.name}
          subtitle={dictionarySubtitle(item, statuses[item.code])}
          onPress={() => setActiveLanguage(item.code)}
          right={
            <View style={styles.right}>
              {dictionaryButton(item)}
              {item.code === activeLanguage ? (
                <Check color={colors.primary} size={22} />
              ) : (
                <View style={styles.checkPlaceholder} />
              )}
            </View>
          }
        />
      )}
      ListFooterComponent={
        <Text style={[styles.footer, { color: colors.textSecondary }]}>
          Tap a language to switch to it. Dictionaries add suggestions with
          word forms and translations when you add words.
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  right: { flexDirection: 'row', alignItems: 'center' },
  checkPlaceholder: { width: 22 },
  footer: { fontSize: 13, padding: 16 },
});
