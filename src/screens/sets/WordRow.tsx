import React, { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Square,
  SquareCheck,
} from 'lucide-react-native';
import { TextButton } from '../../components/TextButton';
import type { Word } from '../../domain/types';
import { useAppTheme } from '../../theme/ThemeProvider';

interface Props {
  word: Word;
  expanded: boolean;
  onToggleExpanded: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleLearned: () => void;
  /** Opens the word's description (only shown when it has one). */
  onOpenDescription: () => void;
  /** Called when this row's actions start opening (to close the others). */
  onSwipeOpen: (methods: SwipeableMethods) => void;
  /** Present in "Select words" mode: rows show checkboxes, swipe is off. */
  selection?: { selected: boolean; onToggle: () => void };
}

const ACTION_WIDTH = 80;

/**
 * Swipe left → Edit / Delete. Tap (or "Show examples") → expand examples.
 * "Description" opens the word's Markdown description in a sheet.
 * "Learned" / "To revise" at the end of the row.
 */
export function WordRow({
  word,
  expanded,
  onToggleExpanded,
  onEdit,
  onDelete,
  onToggleLearned,
  onOpenDescription,
  onSwipeOpen,
  selection,
}: Props) {
  const { colors } = useAppTheme();
  const swipeRef = useRef<SwipeableMethods>(null);
  const learned = word.learnedAt !== null;

  const runAction = (action: () => void) => {
    swipeRef.current?.close();
    action();
  };

  const renderRightActions = () => (
    <View style={styles.actions}>
      <Pressable
        onPress={() => runAction(onEdit)}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${word.term}`}
        style={[styles.action, { backgroundColor: colors.primary }]}
      >
        <Text style={styles.actionText}>Edit</Text>
      </Pressable>
      <Pressable
        onPress={() => runAction(onDelete)}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${word.term}`}
        style={[styles.action, { backgroundColor: colors.danger }]}
      >
        <Text style={styles.actionText}>Delete</Text>
      </Pressable>
    </View>
  );

  const CheckIcon = selection?.selected ? SquareCheck : Square;

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      containerStyle={[styles.card, { borderColor: colors.border }]}
      enabled={!selection}
      friction={2}
      rightThreshold={ACTION_WIDTH / 2}
      overshootRight={false}
      renderRightActions={renderRightActions}
      onSwipeableWillOpen={() =>
        swipeRef.current && onSwipeOpen(swipeRef.current)
      }
    >
      <Pressable
        onPress={selection ? selection.onToggle : onToggleExpanded}
        accessibilityRole={selection ? 'checkbox' : 'button'}
        accessibilityState={
          selection ? { checked: selection.selected } : { expanded }
        }
        accessibilityLabel={word.term}
        style={[styles.row, { backgroundColor: colors.surface }]}
      >
        {selection ? (
          <CheckIcon
            color={selection.selected ? colors.primary : colors.textSecondary}
            size={22}
          />
        ) : null}
        <View style={styles.text}>
          <Text style={[styles.term, { color: colors.text }]}>{word.term}</Text>
          <Text style={[styles.translation, { color: colors.textSecondary }]}>
            {word.translation}
          </Text>
          {expanded && word.examples.length > 0 ? (
            <View style={styles.examples}>
              {word.examples.map((example, i) => (
                <View key={i} style={styles.example}>
                  <Text style={[styles.exampleText, { color: colors.text }]}>
                    {example.text}
                  </Text>
                  {example.translation ? (
                    <Text
                      style={[
                        styles.exampleTranslation,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {example.translation}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
          {(word.examples.length > 0 || word.description) && !selection ? (
            <View style={styles.links}>
              {word.examples.length > 0 ? (
                <Pressable
                  onPress={onToggleExpanded}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  accessibilityLabel={
                    expanded
                      ? 'Hide examples'
                      : `Show ${word.examples.length} examples`
                  }
                  style={({ pressed }) => [
                    styles.more,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.moreText, { color: colors.primary }]}>
                    {expanded
                      ? 'Hide examples'
                      : `Show examples (${word.examples.length})`}
                  </Text>
                  {expanded ? (
                    <ChevronUp color={colors.primary} size={16} />
                  ) : (
                    <ChevronDown color={colors.primary} size={16} />
                  )}
                </Pressable>
              ) : null}
              {word.description ? (
                <Pressable
                  onPress={onOpenDescription}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Description of ${word.term}`}
                  style={({ pressed }) => [
                    styles.more,
                    pressed && styles.pressed,
                  ]}
                >
                  <FileText color={colors.primary} size={14} />
                  <Text style={[styles.moreText, { color: colors.primary }]}>
                    Description
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
        {selection ? null : (
          <TextButton
            title={learned ? 'To revise' : 'Learned'}
            variant={learned ? 'secondary' : 'primary'}
            onPress={onToggleLearned}
          />
        )}
      </Pressable>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  // Each word is a separate rounded card; the swipe actions stay inside it.
  card: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 12,
  },
  text: { flex: 1, paddingTop: 2 },
  term: { fontSize: 16, fontWeight: '500' },
  translation: { fontSize: 14, marginTop: 2 },
  examples: { marginTop: 8, gap: 8 },
  example: { gap: 2 },
  exampleText: { fontSize: 14 },
  exampleTranslation: { fontSize: 13, fontStyle: 'italic' },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 16,
    marginTop: 6,
  },
  more: { flexDirection: 'row', alignItems: 'center', gap: 2 },
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
