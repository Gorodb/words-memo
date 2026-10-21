import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, SectionList, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CircleEllipsis,
  GalleryHorizontalEnd,
  GraduationCap,
  Plus,
} from 'lucide-react-native';
import { ActionTile } from '../../components/ActionTile';
import { useActionMenu } from '../../components/ActionMenuSheet';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { LabeledDivider } from '../../components/LabeledDivider';
import { TextButton } from '../../components/TextButton';
import { useFormSheet } from '../../components/formSheet/FormSheet';
import { nameForm, wordForm } from '../../components/formSheet/forms';
import { BUNDLED_LANGUAGES, DICTIONARIES } from '../../config/languages';
import { getSet, renameSet, setSetPinned } from '../../db/repositories/sets';
import { pinLabel, togglePinned } from '../../components/itemActions';
import {
  createWord,
  deleteWord,
  listWords,
  resetLearned,
  setLearned,
  updateWord,
} from '../../db/repositories/words';
import { useQuery } from '../../db/useQuery';
import type { ID, Word } from '../../domain/types';
import { shareSet } from '../../features/backup/backupFiles';
import { STUDY_MODES } from '../../features/study/modes';
import { useAppTheme } from '../../theme/ThemeProvider';
import type { RootStackParamList } from '../../navigation/types';
import { plural } from '../../utils/plural';
import { WordRow } from './WordRow';

type Props = NativeStackScreenProps<RootStackParamList, 'Set'>;

interface Section {
  key: 'toLearn' | 'learned';
  title: string;
  data: Word[];
}

/**
 * Words of one set: Learn / Flashcards tiles, then "To learn" and "Learned".
 * Header: + (add word) and ⋯ (Edit set / Select words / Study … / Reset).
 */
export function SetScreen({ navigation, route }: Props) {
  const { setId } = route.params;
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const form = useFormSheet();
  const openForm = form.open;
  const menu = useActionMenu();
  const openMenu = menu.open;

  const loadSet = useCallback(() => getSet(setId), [setId]);
  const { data: set } = useQuery(loadSet, ['sets']);
  const loadWords = useCallback(() => listWords(setId), [setId]);
  const { data: words } = useQuery(loadWords, ['words']);

  const [expanded, setExpanded] = useState<ReadonlySet<ID>>(new Set());
  /** null = normal mode; a set of ids = "Select words" mode. */
  const [selected, setSelected] = useState<ReadonlySet<ID> | null>(null);
  const openSwipe = useRef<SwipeableMethods | null>(null);

  useEffect(() => {
    if (set === null) {
      navigation.goBack(); // deleted
    }
  }, [set, navigation]);

  const sections = useMemo<Section[]>(() => {
    const toLearn = (words ?? []).filter(w => w.learnedAt === null);
    const learned = (words ?? []).filter(w => w.learnedAt !== null);
    return [
      {
        key: 'toLearn' as const,
        title: `To learn (${toLearn.length})`,
        data: toLearn,
      },
      {
        key: 'learned' as const,
        title: `Learned (${learned.length})`,
        data: learned,
      },
    ].filter(s => s.data.length > 0);
  }, [words]);

  const languageName = useMemo(
    () => BUNDLED_LANGUAGES.find(l => l.code === set?.languageCode)?.name,
    [set?.languageCode],
  );

  const openWordForm = useCallback(
    (word?: Word) => {
      if (!set) {
        return;
      }
      openForm(
        wordForm({
          title: word ? 'Edit word' : 'New word',
          languageCode: set.languageCode,
          dictionaryHint: DICTIONARIES[set.languageCode]
            ? `Download the ${
                languageName ?? ''
              } dictionary on the Languages tab to get suggestions.`
            : undefined,
          initial: word,
          onSubmit: async input => {
            if (word) {
              await updateWord(word.id, input);
            } else {
              await createWord(setId, input);
            }
          },
        }),
      );
    },
    [openForm, set, setId, languageName],
  );

  const startStudy = useCallback(
    (wordIds: ID[]) =>
      openMenu({
        title: 'Study mode',
        items: STUDY_MODES.map(mode => ({
          label: mode.title,
          onPress: () => {
            setSelected(null);
            navigation.navigate('Study', { wordIds, modeId: mode.id });
          },
        })),
      }),
    [openMenu, navigation],
  );

  /** Study modes over the words to learn, or the whole set once all are learned. */
  const openLearn = useCallback(() => {
    const all = words ?? [];
    const notLearned = all.filter(w => w.learnedAt === null);
    startStudy((notLearned.length > 0 ? notLearned : all).map(w => w.id));
  }, [words, startStudy]);

  const confirmResetLearned = useCallback(() => {
    if (!set) {
      return;
    }
    const learned = (words ?? []).filter(w => w.learnedAt !== null).length;
    Alert.alert(
      'Reset progress?',
      `${plural(learned, 'learned word')} will be marked as not learned.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => resetLearned(set.id),
        },
      ],
    );
  }, [set, words]);

  const openFlashcards = useCallback(() => {
    if (!set) {
      return;
    }
    if ((words ?? []).some(w => w.learnedAt === null)) {
      navigation.navigate('Flashcards', { setId: set.id });
      return;
    }
    Alert.alert(
      'All words are learned',
      'Flashcards show the words to learn. Reset progress to go through the whole set again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset and start',
          onPress: async () => {
            await resetLearned(set.id);
            navigation.navigate('Flashcards', { setId: set.id });
          },
        },
      ],
    );
  }, [set, words, navigation]);

  const openSetMenu = useCallback(() => {
    if (!set) {
      return;
    }
    const all = words ?? [];
    const notLearned = all.filter(w => w.learnedAt === null);
    openMenu({
      title: set.name,
      items: [
        {
          label: pinLabel(set.pinnedAt),
          onPress: () => togglePinned(setSetPinned, set),
        },
        {
          label: 'Edit set',
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
          label: 'Share set',
          disabled: all.length === 0,
          onPress: () =>
            shareSet(set.id, set.name).catch(e =>
              Alert.alert(
                'Could not share the set',
                e instanceof Error ? e.message : String(e),
              ),
            ),
        },
        {
          label: 'Select words',
          disabled: all.length === 0,
          onPress: () => {
            openSwipe.current?.close();
            setSelected(new Set());
          },
        },
        {
          label: 'Study set',
          disabled: all.length === 0,
          onPress: () => startStudy(all.map(w => w.id)),
        },
        {
          label: 'Study not learned',
          disabled: notLearned.length === 0,
          onPress: () => startStudy(notLearned.map(w => w.id)),
        },
        {
          label: 'Reset progress',
          destructive: true,
          disabled: all.length === notLearned.length,
          onPress: confirmResetLearned,
        },
      ],
    });
  }, [set, words, openMenu, openForm, startStudy, confirmResetLearned]);

  const allSelected =
    !!selected && !!words && words.length > 0 && selected.size === words.length;

  useLayoutEffect(() => {
    navigation.setOptions({
      ...(set && { title: set.name }),
      headerRight: () =>
        selected ? (
          <TextButton
            title={allSelected ? 'Deselect all' : 'Select all'}
            onPress={() =>
              setSelected(
                allSelected ? new Set() : new Set((words ?? []).map(w => w.id)),
              )
            }
          />
        ) : (
          <View style={styles.headerButtons}>
            <IconButton
              icon={Plus}
              accessibilityLabel="Add word"
              onPress={() => openWordForm()}
            />
            <IconButton
              icon={CircleEllipsis}
              accessibilityLabel="Set actions"
              onPress={openSetMenu}
            />
          </View>
        ),
    });
  }, [
    navigation,
    set,
    selected,
    allSelected,
    words,
    openWordForm,
    openSetMenu,
  ]);

  const toggle = (ids: ReadonlySet<ID>, id: ID) => {
    const next = new Set(ids);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return next;
  };

  const onSwipeOpen = (methods: SwipeableMethods) => {
    if (openSwipe.current && openSwipe.current !== methods) {
      openSwipe.current.close();
    }
    openSwipe.current = methods;
  };

  const toLearnCount = (words ?? []).filter(w => w.learnedAt === null).length;

  // Study selected words in list order.
  const selectedIds = (words ?? [])
    .filter(w => selected?.has(w.id))
    .map(w => w.id);

  return (
    <>
      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[
          styles.grow,
          // Edge-to-edge: keep the last word above the system navigation bar.
          {
            paddingBottom:
              LIST_END_SPACE + insets.bottom + (selected ? BAR_HEIGHT : 0),
          },
        ]}
        ListHeaderComponent={
          words && words.length > 0 && !selected ? (
            <View style={styles.tiles}>
              <ActionTile
                icon={GraduationCap}
                title="Learn"
                subtitle={`${STUDY_MODES.length} study modes`}
                onPress={openLearn}
              />
              <ActionTile
                icon={GalleryHorizontalEnd}
                title="Flashcards"
                subtitle={
                  toLearnCount > 0 ? `${toLearnCount} to learn` : 'All learned'
                }
                onPress={openFlashcards}
              />
            </View>
          ) : undefined
        }
        renderSectionHeader={({ section }) => (
          <LabeledDivider label={section.title} />
        )}
        renderItem={({ item }) => (
          <WordRow
            word={item}
            expanded={expanded.has(item.id)}
            onToggleExpanded={() => setExpanded(prev => toggle(prev, item.id))}
            onEdit={() => openWordForm(item)}
            onDelete={() => deleteWord(item.id)}
            onToggleLearned={() => setLearned(item.id, item.learnedAt === null)}
            onSwipeOpen={onSwipeOpen}
            selection={
              selected
                ? {
                    selected: selected.has(item.id),
                    onToggle: () =>
                      setSelected(prev =>
                        prev ? toggle(prev, item.id) : prev,
                      ),
                  }
                : undefined
            }
          />
        )}
        ListEmptyComponent={
          words ? (
            <EmptyState title="No words yet" hint="Tap + to add a word." />
          ) : undefined
        }
      />
      {selected ? (
        <View
          style={[
            styles.bar,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              paddingBottom: insets.bottom,
            },
          ]}
        >
          <TextButton
            title="Cancel"
            variant="secondary"
            onPress={() => setSelected(null)}
          />
          <TextButton
            title={`Study (${selectedIds.length})`}
            disabled={selectedIds.length === 0}
            onPress={() => startStudy(selectedIds)}
          />
        </View>
      ) : null}
      {menu.element}
      {form.element}
    </>
  );
}

const BAR_HEIGHT = 56;
/** Space below the last word. */
const LIST_END_SPACE = 32;

const styles = StyleSheet.create({
  grow: { flexGrow: 1 },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tiles: { flexDirection: 'row', gap: 12, padding: 12, paddingBottom: 4 },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
