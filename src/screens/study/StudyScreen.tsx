import React, {
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
} from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { EmptyState } from '../../components/EmptyState';
import { TextButton } from '../../components/TextButton';
import { getWords } from '../../db/repositories/words';
import type { Word } from '../../domain/types';
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
const HIDE_ACTION_WIDTH = 96;

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
  return <RestartableSession mode={mode} words={words} />;
}

/** "Restart" remounts the session: original order, nothing hidden or answered. */
function RestartableSession({
  mode,
  words,
}: {
  mode: ReturnType<typeof studyMode>;
  words: Word[];
}) {
  const [run, setRun] = useState(0);
  return (
    <Session
      key={`${mode.id}-${run}`}
      state={createSession(mode, words)}
      onRestart={() => setRun(r => r + 1)}
    />
  );
}

function Session({
  state: initial,
  onRestart,
}: {
  state: SessionState;
  onRestart: () => void;
}) {
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
        {state.mode.kind === 'write' ? (
          // Reveal modes hide words by swiping a card left instead.
          <TextButton
            title="Hide learned"
            onPress={() => dispatch({ type: 'hideLearned' })}
          />
        ) : null}
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
            action={<TextButton title="Restart" onPress={onRestart} />}
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
              onHide={() => dispatch({ type: 'hide', id })}
            />
          ) : (
            <WriteCard
              card={card}
              status={progress.status}
              hints={progress.hints}
              revision={progress.revision}
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

/** Tap: reveal / hide the answer. Swipe left: hide the card for this session. */
function RevealCard({
  card,
  revealed,
  onToggle,
  onHide,
}: {
  card: StudyCard;
  revealed: boolean;
  onToggle: () => void;
  onHide: () => void;
}) {
  const { colors } = useAppTheme();
  const renderHideAction = () => (
    <View
      style={[styles.hideAction, { backgroundColor: colors.textSecondary }]}
    >
      <Text style={styles.hideActionText}>Hide</Text>
    </View>
  );
  return (
    <ReanimatedSwipeable
      // The container rounds and borders the card: a rounded card inside would
      // let the Hide panel behind it show through at the corners.
      containerStyle={[
        styles.swipeable,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
      friction={1.5}
      rightThreshold={HIDE_ACTION_WIDTH / 2}
      overshootRight={false}
      renderRightActions={renderHideAction}
      // Only right-side actions exist, so opening them = swiped left far enough.
      onSwipeableOpen={onHide}
    >
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={revealed ? card.answer : `Reveal ${card.prompt}`}
        accessibilityHint="Swipe left to hide this word for this session"
        accessibilityActions={[{ name: 'hide', label: 'Hide' }]}
        onAccessibilityAction={e =>
          e.nativeEvent.actionName === 'hide' && onHide()
        }
        style={[
          styles.card,
          styles.cardInSwipeable,
          { backgroundColor: colors.surface },
        ]}
      >
        <Text style={[styles.prompt, { color: colors.text }]}>
          {card.prompt}
        </Text>
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
            {revealed ? card.answer : 'Tap to reveal · swipe left to hide'}
          </Text>
        </View>
      </Pressable>
    </ReanimatedSwipeable>
  );
}

function WriteCard({
  card,
  status,
  hints,
  revision,
  attempt,
  dispatch,
  onFocus,
}: {
  card: StudyCard;
  status: 'idle' | 'correct' | 'wrong' | 'shown';
  hints: number;
  revision: number;
  attempt: number;
  dispatch: React.Dispatch<SessionAction>;
  onFocus: () => void;
}) {
  const { colors } = useAppTheme();
  const seed = hintText(card.answer, hints);
  // The input is uncontrolled; Hint / Try again remount it with a new seed.
  const inputKey = `${attempt}-${revision}`;
  const typed = useRef(seed);
  useEffect(() => {
    typed.current = seed;
  }, [seed, inputKey]);
  const check = () =>
    dispatch({ type: 'check', id: card.id, input: typed.current });
  /** Holding Hint shows the answer over the input; releasing restores it. */
  const [peeking, setPeeking] = useState(false);

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
      {status === 'idle' ? (
        <View>
          <TextInput
            key={inputKey}
            defaultValue={seed}
            autoFocus={hints > 0}
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
                color: colors.text,
                borderColor,
                backgroundColor: colors.background,
              },
            ]}
          />
          {peeking ? (
            // Covers the input without touching it, so the typed text stays.
            <View
              pointerEvents="none"
              style={[
                styles.input,
                styles.peek,
                {
                  borderColor: colors.primary,
                  backgroundColor: colors.background,
                },
              ]}
            >
              <Text style={[styles.peekText, { color: colors.primary }]}>
                {card.answer}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        // Checked: plain text, not a read-only input. On Android a read-only
        // input falls back to its starting text (the hint), losing the rest.
        <View
          style={[
            styles.input,
            { borderColor, backgroundColor: colors.background },
          ]}
        >
          <Text
            style={[
              styles.peekText,
              { color: status === 'correct' ? CORRECT : colors.danger },
            ]}
          >
            {status === 'correct' ? card.answer : typed.current || '—'}
          </Text>
        </View>
      )}
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
              onPress={() =>
                dispatch({ type: 'hint', id: card.id, input: typed.current })
              }
              onLongPress={() => setPeeking(true)}
              onPressOut={() => setPeeking(false)}
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
  swipeable: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  cardInSwipeable: { borderRadius: 0, borderWidth: 0 },
  hideAction: {
    width: HIDE_ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hideActionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
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
  peek: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'center',
  },
  peekText: { fontSize: 16 },
  shownAnswer: { fontSize: 16, fontWeight: '500' },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginRight: -12,
  },
  correct: {
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
