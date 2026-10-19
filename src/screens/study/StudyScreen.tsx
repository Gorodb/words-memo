import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
} from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { EmptyState } from '../../components/EmptyState';
import { TextButton } from '../../components/TextButton';
import { getWords } from '../../db/repositories/words';
import { useQuery } from '../../db/useQuery';
import { studyMode } from '../../features/study/modes';
import {
  createSession,
  hintText,
  sessionReducer,
  visibleIds,
  type SessionAction,
  type SessionState,
  type StudyCard,
} from '../../features/study/session';
import { useAppTheme } from '../../theme/ThemeProvider';
import { useKeyboardHeight } from '../../utils/useKeyboardHeight';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Study'>;

const CORRECT = '#2E9E5B';

/** One study session over the given words; nothing here changes the database. */
export function StudyScreen({ navigation, route }: Props) {
  const { wordIds, modeId } = route.params;
  const mode = studyMode(modeId);
  const load = useCallback(() => getWords(wordIds), [wordIds]);
  // Loaded once: the session is a snapshot of the words.
  const { data: words } = useQuery(load, []);

  useLayoutEffect(() => {
    navigation.setOptions({ title: mode.title });
  }, [navigation, mode.title]);

  if (!words) {
    return null;
  }
  return <Session key={modeId} state={createSession(mode, words)} />;
}

function Session({ state: initial }: { state: SessionState }) {
  const { colors } = useAppTheme();
  const keyboardHeight = useKeyboardHeight();
  const [state, dispatch] = useReducer(sessionReducer, initial);
  const listRef = useRef<FlatList<string>>(null);

  const ids = visibleIds(state);
  const total = state.order.length;

  // Keep the focused input above the keyboard.
  const focusedIndex = useRef<number | null>(null);
  useEffect(() => {
    if (keyboardHeight > 0 && focusedIndex.current !== null) {
      listRef.current?.scrollToIndex({
        index: focusedIndex.current,
        viewPosition: 0.2,
        animated: true,
      });
    }
  }, [keyboardHeight]);

  if (total === 0) {
    return <EmptyState title="No words to study" />;
  }

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.toolbar,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <TextButton
          title="Shuffle"
          onPress={() => dispatch({ type: 'shuffle' })}
        />
        <TextButton
          title="Hide learned"
          onPress={() => dispatch({ type: 'hideLearned' })}
        />
        <Text style={[styles.counter, { color: colors.textSecondary }]}>
          {ids.length} / {total}
        </Text>
      </View>
      <FlatList
        ref={listRef}
        data={ids}
        keyExtractor={id => id}
        keyboardShouldPersistTaps="handled"
        onScrollToIndexFailed={() => {}}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: 24 + keyboardHeight },
        ]}
        ListEmptyComponent={
          <EmptyState
            title="All words are hidden"
            hint="Start a new session to see them again."
          />
        }
        renderItem={({ item: id, index }) => {
          const card = state.cards[id];
          const progress = state.progress[id];
          return progress.kind === 'reveal' ? (
            <RevealCard
              card={card}
              revealed={progress.revealed}
              onToggle={() => dispatch({ type: 'toggleReveal', id })}
            />
          ) : (
            <WriteCard
              card={card}
              status={progress.status}
              hints={progress.hints}
              attempt={progress.attempt}
              dispatch={dispatch}
              onFocus={() => {
                focusedIndex.current = index;
              }}
            />
          );
        }}
      />
    </View>
  );
}

function RevealCard({
  card,
  revealed,
  onToggle,
}: {
  card: StudyCard;
  revealed: boolean;
  onToggle: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={revealed ? card.answer : `Reveal ${card.prompt}`}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Text style={[styles.prompt, { color: colors.text }]}>{card.prompt}</Text>
      <View
        style={[
          styles.answerBox,
          { borderColor: colors.border },
          !revealed && { backgroundColor: colors.border },
        ]}
      >
        <Text
          style={[
            styles.answer,
            { color: revealed ? colors.primary : colors.textSecondary },
          ]}
        >
          {revealed ? card.answer : 'Tap to reveal'}
        </Text>
      </View>
    </Pressable>
  );
}

function WriteCard({
  card,
  status,
  hints,
  attempt,
  dispatch,
  onFocus,
}: {
  card: StudyCard;
  status: 'idle' | 'correct' | 'wrong' | 'shown';
  hints: number;
  attempt: number;
  dispatch: React.Dispatch<SessionAction>;
  onFocus: () => void;
}) {
  const { colors } = useAppTheme();
  const seed = hintText(card.answer, hints);
  // The input is uncontrolled; Hint / Try again remount it with a new seed.
  const inputKey = `${attempt}-${hints}`;
  const typed = useRef(seed);
  useEffect(() => {
    typed.current = seed;
  }, [seed, inputKey]);
  const check = () =>
    dispatch({ type: 'check', id: card.id, input: typed.current });

  const borderColor =
    status === 'correct'
      ? CORRECT
      : status === 'wrong' || status === 'shown'
        ? colors.danger
        : colors.border;

  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor }]}
    >
      <Text style={[styles.prompt, { color: colors.text }]}>{card.prompt}</Text>
      <TextInput
        key={inputKey}
        defaultValue={seed}
        autoFocus={hints > 0}
        editable={status === 'idle'}
        onFocus={onFocus}
        onChangeText={text => {
          typed.current = text;
        }}
        onSubmitEditing={check}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        placeholder="Type the answer"
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel={`Answer for ${card.prompt}`}
        style={[
          styles.input,
          {
            color:
              status === 'correct'
                ? CORRECT
                : status === 'idle'
                  ? colors.text
                  : colors.danger,
            borderColor,
            backgroundColor: colors.background,
          },
        ]}
      />
      {status === 'shown' ? (
        <Text style={[styles.shownAnswer, { color: colors.danger }]}>
          {card.answer}
        </Text>
      ) : null}
      <View style={styles.buttons}>
        {status === 'idle' ? (
          <>
            <TextButton
              title="Hint"
              variant="secondary"
              onPress={() => dispatch({ type: 'hint', id: card.id })}
            />
            <TextButton title="Check" onPress={check} />
          </>
        ) : null}
        {status === 'wrong' ? (
          <>
            <TextButton
              title="Show"
              variant="secondary"
              onPress={() => dispatch({ type: 'show', id: card.id })}
            />
            <TextButton
              title="Mark as correct"
              variant="secondary"
              onPress={() => dispatch({ type: 'markCorrect', id: card.id })}
            />
            <TextButton
              title="Try again"
              onPress={() => dispatch({ type: 'retry', id: card.id })}
            />
          </>
        ) : null}
        {status === 'shown' ? (
          <TextButton
            title="Try again"
            onPress={() => dispatch({ type: 'retry', id: card.id })}
          />
        ) : null}
        {status === 'correct' ? (
          <Text style={[styles.correct, { color: CORRECT }]}>Correct</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  counter: { marginLeft: 'auto', paddingHorizontal: 12, fontSize: 14 },
  list: { padding: 12, gap: 12, flexGrow: 1 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  prompt: { fontSize: 17, fontWeight: '500' },
  answerBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  answer: { fontSize: 16 },
  input: {
    fontSize: 16,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  shownAnswer: { fontSize: 16, fontWeight: '500' },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginRight: -12,
  },
  correct: { fontSize: 15, fontWeight: '600', paddingHorizontal: 12, paddingVertical: 8 },
});
