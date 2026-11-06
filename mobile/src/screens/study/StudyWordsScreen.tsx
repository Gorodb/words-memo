import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { LabeledDivider } from '../../components/LabeledDivider';
import { TextButton } from '../../components/TextButton';
import {
  listWords,
  sampleWordsOutsideSet,
  setLearnedMany,
} from '../../db/repositories/words';
import { useQuery } from '../../db/useQuery';
import type { ID, Word } from '../../domain/types';
import {
  createStudyWords,
  currentRound,
  currentWord,
  expectedAnswer,
  hintSeed,
  pickStudyWords,
  studyWordsReducer,
  studyWordsResult,
  STUDY_WORDS_ROUNDS,
  type GameWord,
  type OptionPools,
  type StudyWordsState,
} from '../../features/study/studyWords';
import { useAppTheme } from '../../theme/ThemeProvider';
import { plural } from '../../utils/plural';
import { useKeyboardHeight } from '../../utils/useKeyboardHeight';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'StudyWords'>;

const CORRECT = '#2E9E5B';
/** Correct, but with a Hint: dark yellow. */
const ASSISTED = '#B8860B';
/** Words from other sets to draw wrong options from. */
const OTHER_POOL_SIZE = 200;

/**
 * "Study words": up to 10 words through three rounds (choose the translation,
 * choose the word, write the word), then a result. Words answered without a
 * mistake or hint are marked as learned.
 */
export function StudyWordsScreen({ navigation, route }: Props) {
  const { setId, wordIds } = route.params;
  // Live: the result screen needs the words still to learn after the writes.
  const loadSetWords = useCallback(() => listWords(setId), [setId]);
  const { data: setWords } = useQuery(loadSetWords, ['words']);
  const loadOther = useCallback(
    () => sampleWordsOutsideSet(setId, OTHER_POOL_SIZE),
    [setId],
  );
  const { data: other } = useQuery(loadOther, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Study words',
      headerBackVisible: false,
      headerLeft: () => (
        <IconButton
          icon={X}
          accessibilityLabel="Close"
          onPress={() => navigation.goBack()}
        />
      ),
    });
  }, [navigation]);

  if (!setWords || !other) {
    return null;
  }
  return (
    <Games
      setWords={setWords}
      other={other}
      wordIds={wordIds}
      navigation={navigation}
    />
  );
}

/** One game after another: "Continue learning" starts a new one. */
function Games({
  setWords,
  other,
  wordIds,
  navigation,
}: {
  setWords: Word[];
  other: OptionPools['other'];
  wordIds?: ID[];
  navigation: Props['navigation'];
}) {
  const toLearn = useMemo(
    () => setWords.filter(w => w.learnedAt === null),
    [setWords],
  );
  const [game, setGame] = useState(() => {
    const ids = wordIds && new Set(wordIds);
    const candidates = ids ? setWords.filter(w => ids.has(w.id)) : toLearn;
    return { run: 0, words: pickStudyWords(candidates) };
  });
  const pools = useMemo(() => ({ set: setWords, other }), [setWords, other]);

  if (game.words.length === 0) {
    return (
      <EmptyState
        title="No words to learn"
        hint="Every word in this set is learned. Reset progress in the set menu to start over."
      />
    );
  }
  return (
    <Game
      key={game.run}
      words={game.words}
      pools={pools}
      navigation={navigation}
      canContinue={toLearn.length > 0}
      onContinue={(mistakes, learned) =>
        setGame(g => ({
          run: g.run + 1,
          // The words with mistakes come back first. `learned` may not have
          // reached the query yet.
          words: pickStudyWords(
            toLearn.filter(w => !learned.includes(w.id)),
            mistakes,
          ),
        }))
      }
    />
  );
}

function Game({
  words,
  pools,
  navigation,
  canContinue,
  onContinue,
}: {
  words: Word[];
  pools: OptionPools;
  navigation: Props['navigation'];
  canContinue: boolean;
  onContinue: (mistakes: ID[], learned: ID[]) => void;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  // The pools are read once, when the game starts.
  const [state, dispatch] = useReducer(studyWordsReducer, null, () =>
    createStudyWords(words, pools),
  );
  const word = currentWord(state);
  const round = currentRound(state);

  // Save the learned words once, when the game ends.
  const saved = useRef(false);
  useEffect(() => {
    if (!state.finished || saved.current) {
      return;
    }
    saved.current = true;
    const ids = studyWordsResult(state)
      .learned.filter(w => !w.learned)
      .map(w => w.id);
    setLearnedMany(ids).catch(e =>
      Alert.alert(
        'Could not save the learned words',
        e instanceof Error ? e.message : String(e),
      ),
    );
  }, [state]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: state.finished
        ? 'Results'
        : `Round ${state.round + 1} of ${STUDY_WORDS_ROUNDS.length}`,
    });
  }, [navigation, state.finished, state.round]);

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.content,
        // The keyboard covers the navigation bar, so pad by one or the other.
        { paddingBottom: 32 + (keyboardHeight || insets.bottom) },
      ]}
    >
      {state.finished || !word ? (
        <Result
          state={state}
          canContinue={canContinue}
          onClose={() => navigation.goBack()}
          onContinue={() =>
            onContinue(
              state.mistakes,
              studyWordsResult(state).learned.map(w => w.id),
            )
          }
        />
      ) : (
        <>
          <View style={styles.progress}>
            <Text style={[styles.roundTitle, { color: colors.text }]}>
              {state.repeat ? `${round.title} · mistakes` : round.title}
            </Text>
            <Text style={[styles.counter, { color: colors.textSecondary }]}>
              {state.index + 1} / {state.queue.length}
            </Text>
          </View>
          <View
            style={[
              styles.promptCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.prompt, { color: colors.text }]}>
              {word[round.prompt]}
            </Text>
          </View>
          {round.kind === 'choose' ? (
            <Choices
              state={state}
              word={word}
              onChoose={option => dispatch({ type: 'choose', option })}
            />
          ) : (
            <WriteAnswer
              // A fresh input for every question and after every Hint.
              key={`${state.round}-${state.repeat}-${state.index}-${state.revision}`}
              state={state}
              onHint={input => dispatch({ type: 'hint', input })}
              onCheck={input => dispatch({ type: 'check', input })}
            />
          )}
          {state.answer ? (
            <View style={styles.next}>
              {state.answer.kind === 'write' && !state.answer.correct ? (
                // A typo: counts as right, unless a Hint was used.
                <TextButton
                  title="Mark as correct"
                  variant="secondary"
                  onPress={() => dispatch({ type: 'markCorrect' })}
                />
              ) : null}
              <TextButton
                title="Next"
                onPress={() => dispatch({ type: 'next' })}
              />
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

/** Four options. After a pick: the right one green, a wrong pick red. */
function Choices({
  state,
  word,
  onChoose,
}: {
  state: StudyWordsState;
  word: GameWord;
  onChoose: (option: string) => void;
}) {
  const { colors } = useAppTheme();
  const answer = state.answer?.kind === 'choose' ? state.answer : null;
  const right = expectedAnswer(state);
  return (
    <View style={styles.choices}>
      {(state.options[word.id] ?? []).map(option => {
        const isRight = option === right;
        const color = !answer
          ? colors.border
          : isRight
          ? CORRECT
          : option === answer.choice
          ? colors.danger
          : colors.border;
        return (
          <Pressable
            key={option}
            disabled={!!answer}
            onPress={() => onChoose(option)}
            accessibilityRole="button"
            accessibilityLabel={option}
            style={({ pressed }) => [
              styles.choice,
              {
                backgroundColor: colors.surface,
                borderColor: color,
                borderWidth: color === colors.border ? 1 : 2,
              },
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.choiceText,
                {
                  color:
                    color === colors.border
                      ? answer
                        ? colors.textSecondary
                        : colors.text
                      : color,
                },
              ]}
            >
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Type the word and Check. Hint adds the next letter (and counts as a
 * mistake). After Check: green, dark yellow (with a hint) or red with the
 * right answer below. "Mark as correct" keeps the typed text and the answer.
 */
function WriteAnswer({
  state,
  onHint,
  onCheck,
}: {
  state: StudyWordsState;
  onHint: (input: string) => void;
  onCheck: (input: string) => void;
}) {
  const { colors } = useAppTheme();
  const seed = hintSeed(state);
  // Uncontrolled: Hint remounts this component with a new seed (see `key`).
  const typed = useRef(seed);
  const answer = state.answer?.kind === 'write' ? state.answer : null;

  if (!answer) {
    return (
      <View style={styles.write}>
        <TextInput
          defaultValue={seed}
          autoFocus
          onChangeText={text => {
            typed.current = text;
          }}
          onSubmitEditing={() => onCheck(typed.current)}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          placeholder="Type the word"
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel="Answer"
          style={[
            styles.input,
            {
              color: colors.text,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            },
          ]}
        />
        <View style={styles.writeButtons}>
          <TextButton
            title="Hint"
            variant="secondary"
            onPress={() => onHint(typed.current)}
          />
          <TextButton title="Check" onPress={() => onCheck(typed.current)} />
        </View>
      </View>
    );
  }

  const color = !answer.correct
    ? colors.danger
    : answer.hinted
    ? ASSISTED
    : CORRECT;
  return (
    <View style={styles.write}>
      {/* Plain text, not a read-only input: on Android that would show the seed. */}
      <View
        style={[
          styles.input,
          { borderColor: color, backgroundColor: colors.surface },
        ]}
      >
        <Text style={[styles.inputText, { color }]}>
          {answer.correct && !answer.marked
            ? expectedAnswer(state)
            : answer.input || '—'}
        </Text>
      </View>
      {!answer.correct || answer.marked ? (
        <Text style={[styles.rightAnswer, { color: CORRECT }]}>
          {expectedAnswer(state)}
        </Text>
      ) : null}
    </View>
  );
}

function Result({
  state,
  canContinue,
  onClose,
  onContinue,
}: {
  state: StudyWordsState;
  canContinue: boolean;
  onClose: () => void;
  onContinue: () => void;
}) {
  const { colors } = useAppTheme();
  const { learned, toLearn } = studyWordsResult(state);
  const perfect = toLearn.length === 0;
  return (
    <View>
      <View style={styles.resultHeader}>
        <Text style={[styles.resultTitle, { color: colors.text }]}>
          {perfect ? 'Well done!' : 'Round finished'}
        </Text>
        <Text style={[styles.resultText, { color: colors.textSecondary }]}>
          {perfect
            ? `No mistakes: ${plural(
                learned.length,
                'word',
              )} marked as learned.`
            : `${plural(learned.length, 'word')} learned · ${
                toLearn.length
              } to learn`}
        </Text>
      </View>
      {!perfect && learned.length > 0 ? (
        <LabeledDivider label={`Learned (${learned.length})`} />
      ) : null}
      {perfect || learned.length > 0 ? <WordList words={learned} /> : null}
      {!perfect ? (
        <>
          <LabeledDivider label={`To learn (${toLearn.length})`} />
          <WordList words={toLearn} />
        </>
      ) : null}
      <View style={styles.resultButtons}>
        <TextButton title="Close" variant="secondary" onPress={onClose} />
        <TextButton
          title="Continue learning"
          disabled={!canContinue}
          onPress={onContinue}
        />
      </View>
      {!canContinue ? (
        <Text style={[styles.resultText, { color: colors.textSecondary }]}>
          Every word in this set is learned.
        </Text>
      ) : null}
    </View>
  );
}

function WordList({ words }: { words: GameWord[] }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[
        styles.list,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      {words.map((w, i) => (
        <View
          key={w.id}
          style={[
            styles.listRow,
            i > 0 && {
              borderTopColor: colors.border,
              borderTopWidth: StyleSheet.hairlineWidth,
            },
          ]}
        >
          <Text style={[styles.listTerm, { color: colors.text }]}>
            {w.term}
          </Text>
          <Text
            style={[styles.listTranslation, { color: colors.textSecondary }]}
          >
            {w.translation}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, flexGrow: 1 },
  progress: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  roundTitle: { fontSize: 15, fontWeight: '600' },
  counter: { fontSize: 14 },
  promptCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 28,
    alignItems: 'center',
  },
  prompt: { fontSize: 22, fontWeight: '600', textAlign: 'center' },
  choices: { gap: 10 },
  choice: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 },
  choiceText: { fontSize: 16 },
  pressed: { opacity: 0.6 },
  write: { gap: 8 },
  input: {
    fontSize: 16,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputText: { fontSize: 16 },
  rightAnswer: { fontSize: 16, fontWeight: '600', paddingHorizontal: 12 },
  writeButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginRight: -12,
  },
  next: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginRight: -12,
  },
  resultHeader: { alignItems: 'center', gap: 6, paddingVertical: 16 },
  resultTitle: { fontSize: 24, fontWeight: '700' },
  resultText: { fontSize: 15, textAlign: 'center' },
  list: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    marginVertical: 6,
  },
  listRow: { paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
  listTerm: { fontSize: 16, fontWeight: '500' },
  listTranslation: { fontSize: 14 },
  resultButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
});
