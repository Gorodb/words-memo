import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, FlatList, SectionList, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CircleEllipsis,
  GalleryHorizontalEnd,
  GraduationCap,
  ListChecks,
  Plus,
} from 'lucide-react-native';
import { ActionTile } from '../../components/ActionTile';
import { useActionMenu } from '../../components/ActionMenuSheet';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { LabeledDivider } from '../../components/LabeledDivider';
import { useMarkdownSheet } from '../../components/MarkdownSheet';
import { SegmentedControl } from '../../components/SegmentedControl';
import { TextButton } from '../../components/TextButton';
import { useFormSheet } from '../../components/formSheet/FormSheet';
import {
  nameForm,
  ruleForm,
  wordForm,
  wordOrRuleForm,
} from '../../components/formSheet/forms';
import { DICTIONARIES } from '../../config/languages';
import { getSet, renameSet, setSetPinned } from '../../db/repositories/sets';
import { pinLabel, togglePinned } from '../../components/itemActions';
import {
  createRule,
  deleteRule,
  listRules,
  updateRule,
} from '../../db/repositories/rules';
import {
  createWord,
  deleteWord,
  listWords,
  resetLearned,
  setLearned,
  updateWord,
} from '../../db/repositories/words';
import { useQuery } from '../../db/useQuery';
import { ruleTitle } from '../../domain/rules';
import type { ID, Rule, Word } from '../../domain/types';
import { STUDY_MODES } from '../../features/study/modes';
import { STUDY_WORDS_COUNT } from '../../features/study/studyWords';
import { useSettingsStore } from '../../store/settingsStore';
import { useAppTheme } from '../../theme/ThemeProvider';
import type { RootStackParamList } from '../../navigation/types';
import { plural } from '../../utils/plural';
import { RuleCard } from './RuleCard';
import { shareSetMenuItems } from './shareActions';
import { WordRow } from './WordRow';

type Props = NativeStackScreenProps<RootStackParamList, 'Set'>;

interface Section {
  key: 'toLearn' | 'learned';
  title: string;
  data: Word[];
}

type Tab = 'words' | 'rules';

/**
 * Words of one set: Learn / Flashcards / Study words tiles, then "To learn" and "Learned".
 * When the set has rules, Words / Rules tabs on top; rules are only read (never studied).
 * Header: + (add word or rule) and ⋯ (Edit set / Select words / Study … / Reset).
 */
export function SetScreen({ navigation, route }: Props) {
  const { setId } = route.params;
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const form = useFormSheet();
  const openForm = form.open;
  const menu = useActionMenu();
  const openMenu = menu.open;
  const reader = useMarkdownSheet();

  const loadSet = useCallback(() => getSet(setId), [setId]);
  const { data: set } = useQuery(loadSet, ['sets']);
  const loadWords = useCallback(() => listWords(setId), [setId]);
  const { data: words } = useQuery(loadWords, ['words']);
  const loadRules = useCallback(() => listRules(setId), [setId]);
  const { data: rules } = useQuery(loadRules, ['rules']);

  const [expanded, setExpanded] = useState<ReadonlySet<ID>>(new Set());
  /** null = normal mode; a set of ids = "Select words" mode. */
  const [selected, setSelected] = useState<ReadonlySet<ID> | null>(null);
  const openSwipe = useRef<SwipeableMethods | null>(null);
  const [tab, setTab] = useState<Tab>('words');
  // Tabs only exist while the set has rules; selecting words needs the Words tab.
  const hasRules = (rules?.length ?? 0) > 0;
  const activeTab: Tab = hasRules && !selected ? tab : 'words';

  // A set with rules but no words opens on the Rules tab.
  const tabInitialized = useRef(false);
  useEffect(() => {
    if (!tabInitialized.current && words && rules) {
      tabInitialized.current = true;
      if (words.length === 0 && rules.length > 0) {
        setTab('rules');
      }
    }
  }, [words, rules]);

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

  const languages = useSettingsStore(s => s.languages);
  const languageName = useMemo(
    () => languages.find(l => l.code === set?.languageCode)?.name,
    [languages, set?.languageCode],
  );

  const openWordForm = useCallback(
    (word?: Word) => {
      if (!set) {
        return;
      }
      const options = wordForm({
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
            setTab('words');
          }
        },
      });
      if (word) {
        openForm(options);
        return;
      }
      // A new entry can be a word or a rule.
      openForm(
        wordOrRuleForm({
          word: options,
          rule: ruleForm({
            title: 'New rule',
            onSubmit: async input => {
              await createRule(setId, input);
              setTab('rules');
            },
          }),
          ruleFirst: activeTab === 'rules',
        }),
      );
    },
    [openForm, set, setId, languageName, activeTab],
  );

  const openRuleForm = useCallback(
    (rule: Rule) =>
      openForm(
        ruleForm({
          title: 'Edit rule',
          initial: rule,
          onSubmit: input => updateRule(rule.id, input),
        }),
      ),
    [openForm],
  );

  const confirmDeleteRule = useCallback(
    (rule: Rule) =>
      Alert.alert(`Delete "${ruleTitle(rule)}"?`, undefined, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteRule(rule.id),
        },
      ]),
    [],
  );

  const startStudy = useCallback(
    (wordIds: ID[]) =>
      openMenu({
        title: 'Study mode',
        items: [
          ...STUDY_MODES.map(mode => ({
            label: mode.title,
            onPress: () => {
              setSelected(null);
              navigation.navigate('Study', { wordIds, modeId: mode.id });
            },
          })),
          {
            label: 'Study words',
            onPress: () => {
              setSelected(null);
              navigation.navigate('StudyWords', { setId, wordIds });
            },
          },
        ],
      }),
    [openMenu, navigation, setId],
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

  /** "Study words" over the words to learn; offers a reset once all are learned. */
  const openStudyWords = useCallback(() => {
    if (!set) {
      return;
    }
    if ((words ?? []).some(w => w.learnedAt === null)) {
      navigation.navigate('StudyWords', { setId: set.id });
      return;
    }
    Alert.alert(
      'All words are learned',
      'Study words picks words to learn. Reset progress to go through the whole set again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset and start',
          onPress: async () => {
            await resetLearned(set.id);
            navigation.navigate('StudyWords', { setId: set.id });
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
          disabled: all.length === 0 && !hasRules,
          // Runs after this menu has closed, so it can open another one.
          onPress: () =>
            openMenu({
              title: `Share "${set.name}"`,
              items: shareSetMenuItems(set),
            }),
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
  }, [
    set,
    words,
    hasRules,
    openMenu,
    openForm,
    startStudy,
    confirmResetLearned,
  ]);

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
              accessibilityLabel="Add word or rule"
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

  const listPadding = {
    // Edge-to-edge: keep the last item above the system navigation bar.
    paddingBottom: LIST_END_SPACE + insets.bottom + (selected ? BAR_HEIGHT : 0),
  };

  return (
    <>
      {hasRules && !selected ? (
        <View style={styles.tabs}>
          <SegmentedControl
            labels={[
              `Words (${words?.length ?? 0})`,
              `Rules (${rules?.length ?? 0})`,
            ]}
            selectedIndex={activeTab === 'words' ? 0 : 1}
            onChange={index => {
              openSwipe.current?.close();
              setTab(index === 0 ? 'words' : 'rules');
            }}
          />
        </View>
      ) : null}
      {activeTab === 'rules' ? (
        <FlatList
          data={rules ?? []}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.rules, listPadding]}
          renderItem={({ item, index }) => (
            <RuleCard
              rule={item}
              number={index + 1}
              onOpen={() =>
                reader.open({ title: ruleTitle(item), text: item.text })
              }
              onEdit={() => openRuleForm(item)}
              onDelete={() => confirmDeleteRule(item)}
              onSwipeOpen={onSwipeOpen}
            />
          )}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={[styles.grow, listPadding]}
          ListHeaderComponent={
            words && words.length > 0 && !selected ? (
              <View style={styles.header}>
                <View style={styles.tiles}>
                  <ActionTile
                    icon={GraduationCap}
                    title="Learn"
                    // The study modes plus "Study words".
                    subtitle={`${STUDY_MODES.length + 1} study modes`}
                    onPress={openLearn}
                  />
                  <ActionTile
                    icon={GalleryHorizontalEnd}
                    title="Flashcards"
                    subtitle={
                      toLearnCount > 0
                        ? `${toLearnCount} to learn`
                        : 'All learned'
                    }
                    onPress={openFlashcards}
                  />
                </View>
                <View style={styles.tiles}>
                  <ActionTile
                    icon={ListChecks}
                    title="Study words"
                    subtitle={
                      toLearnCount > 0
                        ? `${Math.min(
                            toLearnCount,
                            STUDY_WORDS_COUNT,
                          )} words · choose, then write`
                        : 'All learned'
                    }
                    onPress={openStudyWords}
                  />
                </View>
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
              onToggleExpanded={() =>
                setExpanded(prev => toggle(prev, item.id))
              }
              onEdit={() => openWordForm(item)}
              onDelete={() => deleteWord(item.id)}
              onToggleLearned={() =>
                setLearned(item.id, item.learnedAt === null)
              }
              onOpenDescription={() =>
                reader.open({ title: item.term, text: item.description })
              }
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
              <EmptyState
                title="No words yet"
                hint="Tap + to add a word or a rule."
              />
            ) : undefined
          }
        />
      )}
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
      {reader.element}
    </>
  );
}

const BAR_HEIGHT = 56;
/** Space below the last word. */
const LIST_END_SPACE = 32;

const styles = StyleSheet.create({
  grow: { flexGrow: 1 },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tabs: { paddingHorizontal: 12, paddingTop: 12 },
  rules: { flexGrow: 1, paddingTop: 12 },
  header: { padding: 12, paddingBottom: 4, gap: 12 },
  tiles: { flexDirection: 'row', gap: 12 },
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
