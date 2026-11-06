import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../theme/ThemeProvider';

interface Props {
  labels: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
}

/** Equal-width tabs in a rounded track, e.g. Words / Rules or Word / Rule. */
export function SegmentedControl({ labels, selectedIndex, onChange }: Props) {
  const { colors } = useAppTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.track, { backgroundColor: colors.border }]}
    >
      {labels.map((label, i) => {
        const selected = i === selectedIndex;
        return (
          <Pressable
            // By position: labels may carry counts that change.
            key={i}
            onPress={() => !selected && onChange(i)}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            style={[
              styles.segment,
              selected && [
                styles.selected,
                { backgroundColor: colors.surface },
              ],
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                { color: selected ? colors.text : colors.textSecondary },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: 10, padding: 2 },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 8,
  },
  selected: {
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  label: { fontSize: 14, fontWeight: '600' },
});
