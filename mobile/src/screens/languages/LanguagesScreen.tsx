import React, { useCallback, useLayoutEffect } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Check, Plus } from 'lucide-react-native';
import { useActionMenu } from '../../components/ActionMenuSheet';
import { IconButton } from '../../components/IconButton';
import { confirmDelete } from '../../components/itemActions';
import { ListRow } from '../../components/ListRow';
import { TextButton } from '../../components/TextButton';
import { useFormSheet } from '../../components/formSheet/FormSheet';
import { nameForm } from '../../components/formSheet/forms';
import { DICTIONARIES } from '../../config/languages';
import { countLanguageContent } from '../../db/repositories/languages';
import type { Language } from '../../domain/types';
import {
  useDictionaryStore,
  type DictionaryStatus,
} from '../../features/dictionary/dictionaryStore';
import type { TabParamList } from '../../navigation/types';
import { useSettingsStore } from '../../store/settingsStore';
import { useAppTheme } from '../../theme/ThemeProvider';
import { plural } from '../../utils/plural';

function dictionarySubtitle(
  language: Language,
  status: DictionaryStatus | undefined,
): string {
  if (language.custom) {
    return 'Custom · no dictionary, words are typed by hand';
  }
  const size = DICTIONARIES[language.code]?.sizeMB;
  const base = `${language.nativeName} → Русский`;
  if (!DICTIONARIES[language.code]) {
    return `${base} · no dictionary yet`;
  }
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

/** "2 sets and 35 words will be deleted." for the delete confirmation. */
function deleteWarning(content: { sets: number; words: number }): string {
  if (content.sets === 0) {
    return 'Its folders will be deleted.';
  }
  return `${plural(content.sets, 'set')} and ${plural(
    content.words,
    'word',
  )} will be deleted, along with its folders. Export a backup first if you might need them.`;
}

export function LanguagesScreen() {
  const { colors } = useAppTheme();
  const navigation =
    useNavigation<BottomTabNavigationProp<TabParamList, 'LanguagesTab'>>();
  const languages = useSettingsStore(s => s.languages);
  const activeLanguage = useSettingsStore(s => s.activeLanguage);
  const setActiveLanguage = useSettingsStore(s => s.setActiveLanguage);
  const addLanguage = useSettingsStore(s => s.addLanguage);
  const renameLanguage = useSettingsStore(s => s.renameLanguage);
  const removeLanguage = useSettingsStore(s => s.removeLanguage);
  const statuses = useDictionaryStore(s => s.statuses);
  const download = useDictionaryStore(s => s.download);
  const remove = useDictionaryStore(s => s.remove);
  const form = useFormSheet();
  const openForm = form.open;
  const menu = useActionMenu();

  const openCreate = useCallback(
    () =>
      openForm(
        nameForm({
          title: 'New language',
          placeholder: 'Language name, e.g. French',
          onSubmit: async name => {
            const language = await addLanguage(name);
            setActiveLanguage(language.code);
          },
        }),
      ),
    [openForm, addLanguage, setActiveLanguage],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <IconButton
          icon={Plus}
          accessibilityLabel="Add language"
          onPress={openCreate}
        />
      ),
    });
  }, [navigation, openCreate]);

  const onLongPress = (language: Language) => {
    if (!language.custom) {
      return;
    }
    menu.open({
      title: language.name,
      items: [
        {
          label: 'Rename',
          onPress: () =>
            openForm(
              nameForm({
                title: 'Rename language',
                placeholder: 'Language name',
                initialValue: language.name,
                onSubmit: name => renameLanguage(language.code, name),
              }),
            ),
        },
        {
          label: 'Delete',
          destructive: true,
          onPress: async () =>
            confirmDelete(
              language.name,
              deleteWarning(await countLanguageContent(language.code)),
              () => removeLanguage(language.code),
            ),
        },
      ],
    });
  };

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
    <>
      <FlatList
        data={languages}
        keyExtractor={item => item.code}
        renderItem={({ item }) => (
          <ListRow
            title={item.name}
            subtitle={dictionarySubtitle(item, statuses[item.code])}
            onPress={() => setActiveLanguage(item.code)}
            onLongPress={item.custom ? () => onLongPress(item) : undefined}
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
            word forms and translations when you add words. Tap + to add another
            language without a dictionary; long-press it to rename or delete it.
          </Text>
        }
      />
      {menu.element}
      {form.element}
    </>
  );
}

const styles = StyleSheet.create({
  right: { flexDirection: 'row', alignItems: 'center' },
  checkPlaceholder: { width: 22 },
  footer: { fontSize: 13, padding: 16 },
});
