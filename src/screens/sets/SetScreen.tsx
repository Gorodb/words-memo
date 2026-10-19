import React, { useCallback, useEffect, useLayoutEffect } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Plus } from 'lucide-react-native';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { ListRow } from '../../components/ListRow';
import { confirmDelete } from '../../components/itemActions';
import { useFormSheet } from '../../components/formSheet/FormSheet';
import { wordForm } from '../../components/formSheet/forms';
import { getSet } from '../../db/repositories/sets';
import {
  createWord,
  deleteWord,
  listWords,
  updateWord,
} from '../../db/repositories/words';
import { useQuery } from '../../db/useQuery';
import type { Word } from '../../domain/types';
import { plural } from '../../utils/plural';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Set'>;

/** Words of one set. Tap = edit, long-press = delete, header + = add. */
export function SetScreen({ navigation, route }: Props) {
  const { setId } = route.params;
  const sheet = useFormSheet();
  const openSheet = sheet.open;

  const loadSet = useCallback(() => getSet(setId), [setId]);
  const { data: set } = useQuery(loadSet, ['sets']);
  const loadWords = useCallback(() => listWords(setId), [setId]);
  const { data: words } = useQuery(loadWords, ['words']);

  useEffect(() => {
    if (set === null) {
      navigation.goBack(); // deleted
    }
  }, [set, navigation]);

  const openCreate = useCallback(
    () =>
      openSheet(
        wordForm({
          title: 'New word',
          onSubmit: async input => {
            await createWord(setId, input);
          },
        }),
      ),
    [openSheet, setId],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      ...(set && { title: set.name }),
      headerRight: () => (
        <IconButton
          icon={Plus}
          accessibilityLabel="Add word"
          onPress={openCreate}
        />
      ),
    });
  }, [navigation, set, openCreate]);

  const openEdit = (word: Word) =>
    openSheet(
      wordForm({
        title: 'Edit word',
        initial: word,
        onSubmit: input => updateWord(word.id, input),
      }),
    );

  // TODO(step 6): "Learn" button that opens a learning program picker.
  return (
    <>
      <FlatList
        data={words ?? []}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.grow}
        renderItem={({ item }) => (
          <ListRow
            title={item.term}
            subtitle={
              item.examples.length > 0
                ? `${item.translation} · ${plural(item.examples.length, 'example')}`
                : item.translation
            }
            onPress={() => openEdit(item)}
            onLongPress={() =>
              confirmDelete(item.term, 'This word will be deleted.', () =>
                deleteWord(item.id),
              )
            }
          />
        )}
        ListEmptyComponent={
          words ? (
            <EmptyState title="No words yet" hint="Tap + to add a word." />
          ) : undefined
        }
      />
      {sheet.element}
    </>
  );
}

const styles = StyleSheet.create({
  grow: { flexGrow: 1 },
});
