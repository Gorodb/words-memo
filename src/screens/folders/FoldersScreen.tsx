import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import { Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import ReorderableList, {
  reorderItems,
  useReorderableDrag,
  type ReorderableListReorderEvent,
} from 'react-native-reorderable-list';
import { GripVertical, Plus } from 'lucide-react-native';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { ListRow } from '../../components/ListRow';
import { useFormSheet } from '../../components/formSheet/FormSheet';
import { nameForm } from '../../components/formSheet/forms';
import {
  createFolder,
  listFolders,
  reorderFolders,
  type FolderWithCount,
} from '../../db/repositories/folders';
import { useQuery } from '../../db/useQuery';
import { useActiveLanguage } from '../../store/useActiveLanguage';
import { useAppTheme } from '../../theme/ThemeProvider';
import { plural } from '../../utils/plural';
import type { FoldersStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<FoldersStackParamList, 'Folders'>;

/** Long-press the row (or press the grip) to drag it. */
function FolderRow({
  folder,
  onPress,
}: {
  folder: FolderWithCount;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const drag = useReorderableDrag();
  return (
    <ListRow
      title={folder.name}
      subtitle={plural(folder.setCount, 'set')}
      pinned={folder.pinnedAt !== null}
      onPress={onPress}
      onLongPress={drag}
      right={
        <Pressable
          onPressIn={drag}
          hitSlop={12}
          accessibilityLabel={`Reorder ${folder.name}`}
          style={styles.grip}
        >
          <GripVertical color={colors.textSecondary} size={20} />
        </Pressable>
      }
    />
  );
}

export function FoldersScreen({ navigation }: Props) {
  const language = useActiveLanguage();
  const form = useFormSheet();
  const openForm = form.open;

  const load = useCallback(() => listFolders(language.code), [language.code]);
  const { data } = useQuery(load, ['folders', 'folder_sets']);

  // Local copy so a drop shows the new order instantly, before the DB write.
  const [folders, setFolders] = useState<FolderWithCount[] | undefined>();
  useEffect(() => setFolders(data), [data]);

  const onReorder = ({ from, to }: ReorderableListReorderEvent) => {
    if (!folders) {
      return;
    }
    const next = reorderItems(folders, from, to);
    setFolders(next);
    reorderFolders(next.map(f => f.id));
  };

  const openCreate = useCallback(
    () =>
      openForm(
        nameForm({
          title: `New ${language.name} folder`,
          placeholder: 'Folder name',
          onSubmit: async name => {
            await createFolder(language.code, name);
          },
        }),
      ),
    [openForm, language.code, language.name],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: `Folders · ${language.name}`,
      headerRight: () => (
        <IconButton
          icon={Plus}
          accessibilityLabel="Create folder"
          onPress={openCreate}
        />
      ),
    });
  }, [navigation, language.name, openCreate]);

  return (
    <>
      <ReorderableList
        data={folders ?? []}
        keyExtractor={item => item.id}
        onReorder={onReorder}
        contentContainerStyle={styles.grow}
        renderItem={({ item }) => (
          <FolderRow
            folder={item}
            onPress={() =>
              navigation.navigate('Folder', {
                folderId: item.id,
                title: item.name,
              })
            }
          />
        )}
        ListEmptyComponent={
          folders ? (
            <EmptyState
              title={`No ${language.name} folders yet`}
              hint="Tap + to create your first folder."
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
  grip: { paddingLeft: 12 },
});
