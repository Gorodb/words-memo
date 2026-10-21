import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeftRight, Shuffle, Undo2, X } from 'lucide-react-native';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { TextButton } from '../../components/TextButton';
import { listWords, setLearned } from '../../db/repositories/words';
import { useQuery } from '../../db/useQuery';
import type { ID, Word } from '../../domain/types';
import {
  createFlashcards,
  currentCard,
  flashcardsReducer,
  isFinished,
  learnedWrite,
  roundStats,
  type Flashcard,
  type FlashcardsAction,
} from '../../features/study/flashcards';
import { useAppTheme } from '../../theme/ThemeProvider';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Flashcards'>;

const LEARNED = '#2E9E5B';
/** Drag distance (px) or fling speed (px/s) that answers the card. */
const SWIPE_DISTANCE = 110;
const SWIPE_VELOCITY = 900;

/** Flashcards over the words of a set that are not learned yet. */
export function FlashcardsScreen({ navigation, route }: Props) {
  const { setId } = route.params;
  const load = useCallback(
    async () => (await listWords(setId)).filter(w => w.learnedAt === null),
    [setId],
  );
  // Loaded once: the game is a snapshot of the words, and swipes write to them.
  const { data: words } = useQuery(load, []);

  useLayoutEffect(() => {
    navigation.setOptions({
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

  if (!words) {
    return null;
  }
  return <Game words={words} navigation={navigation} />;
}

function Game({
  words,
  navigation,
}: {
  words: Word[];
  navigation: Props['navigation'];
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [state, dispatchState] = useReducer(
    flashcardsReducer,
    words,
    createFlashcards,
  );
  const card = currentCard(state);
  const finished = isFinished(state);
  const total = state.order.length;

  // Read by callbacks that run after an animation, when `state` may be stale.
  const latest = useRef(state);
  useLayoutEffect(() => {
    latest.current = state;
  }, [state]);

  const dispatch = (action: FlashcardsAction) => {
    const write = learnedWrite(latest.current, action);
    if (write) {
      setLearned(write.id, write.learned).catch(e =>
        Alert.alert(
          'Could not save the word',
          e instanceof Error ? e.message : String(e),
        ),
      );
    }
    dispatchState(action);
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      title:
        total === 0
          ? 'Flashcards'
          : `${Math.min(state.index + 1, total)} / ${total}`,
      headerRight: () => (
        <IconButton
          icon={Shuffle}
          accessibilityLabel="Shuffle"
          onPress={() => dispatchState({ type: 'shuffle' })}
        />
      ),
    });
  }, [navigation, state.index, total]);

  if (total === 0) {
    return (
      <EmptyState
        title="No words to learn"
        hint="Every word in this set is learned. Reset progress in the set menu to start over."
      />
    );
  }

  const stats = roundStats(state);

  return (
    // Its own root: on iOS the screen is a native modal, outside the app's root.
    <GestureHandlerRootView
      style={[styles.root, { paddingBottom: 24 + insets.bottom }]}
    >
      <View style={styles.cardArea}>
        {card ? (
          <SwipeCard
            // A new card (or the same one after Undo) starts unflipped in the middle.
            key={`${card.id}-${state.index}-${state.termFirst}`}
            card={card}
            termFirst={state.termFirst}
            onSwipe={(id, learned) => {
              // Undo during the fly-out already moved on to another card.
              if (currentCard(latest.current)?.id === id) {
                dispatch({ type: 'swipe', learned });
              }
            }}
          />
        ) : (
          <View style={styles.done}>
            <Text style={[styles.doneTitle, { color: colors.text }]}>
              Round finished
            </Text>
            <Text style={[styles.doneStats, { color: colors.textSecondary }]}>
              {stats.learned} learned · {stats.toLearn} to learn
            </Text>
            <View style={styles.doneButtons}>
              {stats.toLearn > 0 ? (
                <TextButton
                  title={`Repeat ${stats.toLearn} to learn`}
                  onPress={() => dispatchState({ type: 'repeat' })}
                />
              ) : null}
              <TextButton
                title="Close"
                variant={stats.toLearn > 0 ? 'secondary' : 'primary'}
                onPress={() => navigation.goBack()}
              />
            </View>
          </View>
        )}
      </View>
      {!finished ? (
        <Text style={[styles.legend, { color: colors.textSecondary }]}>
          ← To learn · Learned →
        </Text>
      ) : null}
      <View style={styles.controls}>
        <ControlButton
          icon={Undo2}
          label="Undo"
          disabled={state.history.length === 0}
          onPress={() => dispatch({ type: 'undo' })}
        />
        <ControlButton
          icon={ArrowLeftRight}
          label={state.termFirst ? 'Word first' : 'Translation first'}
          onPress={() => dispatchState({ type: 'toggleSide' })}
        />
      </View>
    </GestureHandlerRootView>
  );
}

/**
 * Tap: flip between the two sides. Swipe right: learned, swipe left: to learn.
 * The card flies off the screen before `onSwipe` runs.
 */
function SwipeCard({
  card,
  termFirst,
  onSwipe,
}: {
  card: Flashcard;
  termFirst: boolean;
  onSwipe: (id: ID, learned: boolean) => void;
}) {
  const { colors } = useAppTheme();
  const [flipped, setFlipped] = useState(false);
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  /** 0 = front, 1 = back. */
  const flip = useSharedValue(0);

  useEffect(() => {
    flip.value = withTiming(flipped ? 1 : 0, { duration: 250 });
  }, [flipped, flip]);

  const toggle = () => setFlipped(f => !f);
  const flyOut = (learned: boolean) => {
    'worklet';
    x.value = withTiming(
      (learned ? 1 : -1) * Math.max(width, 400) * 1.5,
      { duration: 200 },
      finished => {
        if (finished) {
          scheduleOnRN(onSwipe, card.id, learned);
        }
      },
    );
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate(e => {
      x.value = e.translationX;
    })
    .onEnd(e => {
      const fling =
        Math.abs(e.translationX) > SWIPE_DISTANCE ||
        Math.abs(e.velocityX) > SWIPE_VELOCITY;
      if (fling && e.translationX !== 0) {
        flyOut(e.translationX > 0);
      } else {
        x.value = withSpring(0);
      }
    });
  const tap = Gesture.Tap().onEnd(() => {
    scheduleOnRN(toggle);
  });
  const gesture = Gesture.Race(pan, tap);

  const moveStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { rotate: `${x.value / 20}deg` }],
  }));
  const frontStyle = useAnimatedStyle(() => ({
    opacity: flip.value < 0.5 ? 1 : 0,
    transform: [
      { perspective: 1000 },
      { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` },
    ],
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: flip.value < 0.5 ? 0 : 1,
    transform: [
      { perspective: 1000 },
      { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` },
    ],
  }));
  const learnedBadge = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, SWIPE_DISTANCE], [0, 1], 'clamp'),
  }));
  const toLearnBadge = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [-SWIPE_DISTANCE, 0], [1, 0], 'clamp'),
  }));

  const front = termFirst ? card.term : card.translation;
  const back = termFirst ? card.translation : card.term;
  const face = [
    styles.face,
    { backgroundColor: colors.surface, borderColor: colors.border },
  ];

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        entering={FadeIn.duration(150)}
        onLayout={e => setWidth(e.nativeEvent.layout.width)}
        style={[styles.card, moveStyle]}
        accessible
        accessibilityRole="button"
        accessibilityLabel={flipped ? back : front}
        accessibilityHint="Tap to flip. Swipe right if you know it, left to keep learning it."
        accessibilityActions={[
          { name: 'activate', label: 'Flip' },
          { name: 'learned', label: 'Learned' },
          { name: 'toLearn', label: 'To learn' },
        ]}
        onAccessibilityAction={e => {
          const name = e.nativeEvent.actionName;
          if (name === 'activate') {
            toggle();
          } else if (name === 'learned' || name === 'toLearn') {
            flyOut(name === 'learned');
          }
        }}
      >
        <Animated.View style={[face, frontStyle]}>
          <Text style={[styles.side, { color: colors.textSecondary }]}>
            {termFirst ? 'Word' : 'Translation'}
          </Text>
          <Text style={[styles.text, { color: colors.text }]}>{front}</Text>
        </Animated.View>
        <Animated.View style={[face, backStyle]}>
          <Text style={[styles.side, { color: colors.textSecondary }]}>
            {termFirst ? 'Translation' : 'Word'}
          </Text>
          <Text style={[styles.text, { color: colors.primary }]}>{back}</Text>
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.badge,
            styles.badgeLeft,
            { borderColor: LEARNED },
            learnedBadge,
          ]}
        >
          <Text style={[styles.badgeText, { color: LEARNED }]}>Learned</Text>
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.badge,
            styles.badgeRight,
            { borderColor: colors.danger },
            toLearnBadge,
          ]}
        >
          <Text style={[styles.badgeText, { color: colors.danger }]}>
            To learn
          </Text>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

function ControlButton({
  icon: Icon,
  label,
  onPress,
  disabled,
}: {
  icon: typeof Undo2;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.control,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View
        style={[
          styles.controlIcon,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Icon color={colors.primary} size={22} />
      </View>
      <Text style={[styles.controlLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  cardArea: { flex: 1, padding: 24, justifyContent: 'center' },
  card: { height: '80%', maxHeight: 420 },
  face: {
    ...StyleSheet.absoluteFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backfaceVisibility: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  side: {
    position: 'absolute',
    top: 16,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  text: { fontSize: 26, fontWeight: '600', textAlign: 'center' },
  badge: {
    position: 'absolute',
    top: 20,
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeLeft: { left: 20, transform: [{ rotate: '-12deg' }] },
  badgeRight: { right: 20, transform: [{ rotate: '12deg' }] },
  badgeText: { fontSize: 16, fontWeight: '700', textTransform: 'uppercase' },
  legend: { textAlign: 'center', fontSize: 13, marginBottom: 16 },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 48 },
  control: { alignItems: 'center', gap: 6, minWidth: 96 },
  controlIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlLabel: { fontSize: 13 },
  pressed: { opacity: 0.5 },
  disabled: { opacity: 0.35 },
  done: { alignItems: 'center', gap: 8 },
  doneTitle: { fontSize: 20, fontWeight: '600' },
  doneStats: { fontSize: 15 },
  doneButtons: { marginTop: 8, alignItems: 'center' },
});
