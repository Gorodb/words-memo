import React, { useCallback, useLayoutEffect } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Plus } from 'lucide-react-native';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { ListRow } from '../../components/ListRow';
import { useActionMenu } from '../../components/ActionMenuSheet';
import {
  confirmDelete,
  pinLabel,
  togglePinned,
} from '../../components/itemActions';
import { useFormSheet } from '../../components/formSheet/FormSheet';
import { nameForm } from '../../components/formSheet/forms';
import {
  createSet,
  deleteSet,
  listSets,
  renameSet,
  setSetPinned,
  type WordSetWithCount,
} from '../../db/repositories/sets';
import { useQuery } from '../../db/useQuery';
import { useActiveLanguage } from '../../store/useActiveLanguage';
import { setContents } from '../../utils/plural';
import type { RootStackParamList, TabParamList } from '../../navigation/types';

/** All sets of the active language, whether in folders or not. Pinned sets first. */
export function SetsScreen() {
  const tabNavigation =
    useNavigation<BottomTabNavigationProp<TabParamList, 'SetsTab'>>();
  const rootNavigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const language = useActiveLanguage();
  const form = useFormSheet();
  const openForm = form.open;
  const menu = useActionMenu();

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
    menu.open({
      title: set.name,
      items: [
        {
          label: pinLabel(set.pinnedAt),
          onPress: () => togglePinned(setSetPinned, set),
        },
        {
          label: 'Rename',
          onPress: () =>
            openForm(
              nameForm({
                title: 'Rename set',
                placeholder: 'Set name',
                initialValue: set.name,
                onSubmit: name => renameSet(set.id, name),
              }),
            ),
        },
        {
          label: 'Delete',
          destructive: true,
          onPress: () =>
            confirmDelete(
              set.name,
              set.wordCount > 0 || set.ruleCount > 0
                ? `${setContents(
                    set,
                  )} will be deleted, and the set will be removed from all folders.`
                : 'The set will be removed from all folders.',
              () => deleteSet(set.id),
            ),
        },
      ],
    });

  return (
    <>
      <FlatList
        data={sets ?? []}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.grow}
        renderItem={({ item }) => (
          <ListRow
            variant="card"
            title={item.name}
            subtitle={setContents(item)}
            pinned={item.pinnedAt !== null}
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
      {menu.element}
      {form.element}
    </>
  );
}

const styles = StyleSheet.create({
  grow: { flexGrow: 1, paddingTop: 8, paddingBottom: 32 },
});
