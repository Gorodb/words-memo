import React, { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { ruleTitle } from '../../domain/rules';
import type { Rule } from '../../domain/types';
import { useAppTheme } from '../../theme/ThemeProvider';

interface Props {
  rule: Rule;
  /** 1-based position, for accessibility labels. */
  number: number;
  /** Opens the whole rule. */
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Called when this card's actions start opening (to close the others). */
  onSwipeOpen: (methods: SwipeableMethods) => void;
}

const ACTION_WIDTH = 80;

/**
 * A rule's title with "More…" below (tap either to read the whole rule).
 * Swipe left → Edit / Delete, like word rows.
 */
export function RuleCard({
  rule,
  number,
  onOpen,
  onEdit,
  onDelete,
  onSwipeOpen,
}: Props) {
  const { colors } = useAppTheme();
  const swipeRef = useRef<SwipeableMethods>(null);

  const runAction = (action: () => void) => {
    swipeRef.current?.close();
    action();
  };

  const renderRightActions = () => (
    <View style={styles.actions}>
      <Pressable
        onPress={() => runAction(onEdit)}
        accessibilityRole="button"
        accessibilityLabel={`Edit rule ${number}`}
        style={[styles.action, { backgroundColor: colors.primary }]}
      >
        <Text style={styles.actionText}>Edit</Text>
      </Pressable>
      <Pressable
        onPress={() => runAction(onDelete)}
        accessibilityRole="button"
        accessibilityLabel={`Delete rule ${number}`}
        style={[styles.action, { backgroundColor: colors.danger }]}
      >
        <Text style={styles.actionText}>Delete</Text>
      </Pressable>
    </View>
  );

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      containerStyle={[styles.card, { borderColor: colors.border }]}
      friction={2}
      rightThreshold={ACTION_WIDTH / 2}
      overshootRight={false}
      renderRightActions={renderRightActions}
      onSwipeableWillOpen={() =>
        swipeRef.current && onSwipeOpen(swipeRef.current)
      }
    >
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Read rule ${ruleTitle(rule)}`}
        style={[styles.content, { backgroundColor: colors.surface }]}
      >
        <Text style={[styles.title, { color: colors.text }]}>
          {ruleTitle(rule)}
        </Text>
        <Pressable
          onPress={onOpen}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`More about ${ruleTitle(rule)}`}
          style={({ pressed }) => [styles.more, pressed && styles.pressed]}
        >
          <Text style={[styles.moreText, { color: colors.primary }]}>
            More…
          </Text>
        </Pressable>
      </Pressable>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  content: { paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 16, fontWeight: '500' },
  more: { alignSelf: 'flex-start', marginTop: 6 },
  moreText: { fontSize: 13, fontWeight: '600' },
  pressed: { opacity: 0.5 },
  actions: { flexDirection: 'row' },
  action: {
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
