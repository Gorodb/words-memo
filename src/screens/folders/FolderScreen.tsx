import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { CircleEllipsis, ListPlus } from 'lucide-react-native';
import { useActionMenu } from '../../components/ActionMenuSheet';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { ListRow } from '../../components/ListRow';
import { confirmDelete } from '../../components/itemActions';
import { useFormSheet } from '../../components/formSheet/FormSheet';
import { nameForm } from '../../components/formSheet/forms';
import {
  deleteFolder,
  getFolder,
  renameFolder,
} from '../../db/repositories/folders';
import { createSet, listSetsInFolder } from '../../db/repositories/sets';
import { useQuery } from '../../db/useQuery';
import { useSettingsStore } from '../../store/settingsStore';
import { plural } from '../../utils/plural';
import { SetPickerSheet, type SetPickerHandle } from './SetPickerSheet';
import type {
  FoldersStackParamList,
  RootStackParamList,
} from '../../navigation/types';

type Props = NativeStackScreenProps<FoldersStackParamList, 'Folder'>;

/**
 * Sets pinned to one folder.
 * Header: back + folder name, "add sets" (picker sheet) and "…" (Edit / Remove menu).
 */
export function FolderScreen({ navigation, route }: Props) {
  const { folderId } = route.params;
  const rootNavigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const activeLanguage = useSettingsStore(s => s.activeLanguage);
  const form = useFormSheet();
  const openForm = form.open;
  const menu = useActionMenu();
  const openMenu = menu.open;
  const pickerRef = useRef<SetPickerHandle>(null);

  const loadFolder = useCallback(() => getFolder(folderId), [folderId]);
  const { data: folder } = useQuery(loadFolder, ['folders']);
  const loadSets = useCallback(() => listSetsInFolder(folderId), [folderId]);
  const { data: sets } = useQuery(loadSets, ['sets', 'folder_sets', 'words']);

  // Leave the screen if the folder was removed or the language was switched.
  useEffect(() => {
    if (
      folder === null ||
      (folder && folder.languageCode !== activeLanguage)
    ) {
      navigation.popToTop();
    }
  }, [folder, activeLanguage, navigation]);

  const openCreateSet = useCallback(() => {
    if (!folder) {
      return;
    }
    openForm(
      nameForm({
        title: 'New set',
        placeholder: 'Set name',
        // Created from this folder, so it's pinned here right away.
        onSubmit: async name => {
          await createSet(folder.languageCode, name, folder.id);
        },
      }),
    );
  }, [openForm, folder]);

  const openFolderMenu = useCallback(() => {
    if (!folder) {
      return;
    }
    openMenu({
      title: folder.name,
      items: [
        {
          label: 'Edit',
          onPress: () =>
            openForm(
              nameForm({
                title: 'Rename folder',
                placeholder: 'Folder name',
                initialValue: folder.name,
                onSubmit: name => renameFolder(folder.id, name),
              }),
            ),
        },
        {
          label: 'Remove',
          destructive: true,
          onPress: () =>
            confirmDelete(
              folder.name,
              'Its sets will stay available on the Sets tab.',
              () => deleteFolder(folder.id),
            ),
        },
      ],
    });
  }, [openMenu, openForm, folder]);

  useLayoutEffect(() => {
    navigation.setOptions({
      ...(folder && { title: folder.name }),
      headerRight: () => (
        <View style={styles.headerButtons}>
          <IconButton
            icon={ListPlus}
            accessibilityLabel="Add sets"
            onPress={() => pickerRef.current?.open()}
          />
          <IconButton
            icon={CircleEllipsis}
            accessibilityLabel="Folder actions"
            onPress={openFolderMenu}
          />
        </View>
      ),
    });
  }, [navigation, folder, openFolderMenu]);

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
          />
        )}
        ListEmptyComponent={
          sets ? (
            <EmptyState
              title="No sets in this folder"
              hint="Tap the list icon at the top to add sets."
            />
          ) : undefined
        }
      />
      {folder ? (
        <SetPickerSheet
          ref={pickerRef}
          folderId={folder.id}
          languageCode={folder.languageCode}
          onCreateSet={openCreateSet}
        />
      ) : null}
      {menu.element}
      {form.element}
    </>
  );
}

const styles = StyleSheet.create({
  grow: { flexGrow: 1 },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
