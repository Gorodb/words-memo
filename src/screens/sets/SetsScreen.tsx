import React, { useCallback, useLayoutEffect } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Plus } from 'lucide-react-native';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { ListRow } from '../../components/ListRow';
import { showItemActions } from '../../components/itemActions';
import { useFormSheet } from '../../components/formSheet/FormSheet';
import { nameForm } from '../../components/formSheet/forms';
import {
  createSet,
  deleteSet,
  listSets,
  renameSet,
  type WordSetWithCount,
} from '../../db/repositories/sets';
import { useQuery } from '../../db/useQuery';
import { useActiveLanguage } from '../../store/useActiveLanguage';
import { plural } from '../../utils/plural';
import type { RootStackParamList, TabParamList } from '../../navigation/types';

/** All sets of the active language, whether pinned to folders or not. */
export function SetsScreen() {
  const tabNavigation =
    useNavigation<BottomTabNavigationProp<TabParamList, 'SetsTab'>>();
  const rootNavigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const language = useActiveLanguage();
  const form = useFormSheet();
  const openForm = form.open;

  const load = useCallback(() => listSets(language.code), [language.code]);
  const { data: sets } = useQuery(load, ['sets', 'words']);

  const openCreate = useCallback(
    () =>
      openForm(
        nameForm({
          title: `New ${language.name} set`,
          placeholder: 'Set name',
          onSubmit: async name => {
            await createSet(language.code, name);
          },
        }),
      ),
    [openForm, language.code, language.name],
  );

  useLayoutEffect(() => {
    tabNavigation.setOptions({
      headerRight: () => (
        <IconButton
          icon={Plus}
          accessibilityLabel="Create set"
          onPress={openCreate}
        />
      ),
    });
  }, [tabNavigation, openCreate]);

  const onLongPress = (set: WordSetWithCount) =>
    showItemActions({
      name: set.name,
      onRename: () =>
        openForm(
          nameForm({
            title: 'Rename set',
            placeholder: 'Set name',
            initialValue: set.name,
            onSubmit: name => renameSet(set.id, name),
          }),
        ),
      deleteWarning:
        set.wordCount > 0
          ? `${plural(set.wordCount, 'word')} will be deleted, and the set will be removed from all folders.`
          : 'The set will be removed from all folders.',
      onDelete: () => deleteSet(set.id),
    });

  return (
    <>
      <FlatList
        data={sets ?? []}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.grow}
        renderItem={({ item }) => (
          <ListRow
            title={item.name}
            subtitle={plural(item.wordCount, 'word')}
            chevron
            onPress={() =>
              rootNavigation.navigate('Set', {
                setId: item.id,
                title: item.name,
              })
            }
            onLongPress={() => onLongPress(item)}
          />
        )}
        ListEmptyComponent={
          sets ? (
            <EmptyState
              title={`No ${language.name} sets yet`}
              hint="Tap + to create a set."
            />
          ) : undefined
        }
      />
      {form.element}
    </>
  );
}

const styles = StyleSheet.create({
  grow: { flexGrow: 1 },
});
