import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../theme/ThemeProvider';

/** ───── Label ───── separator, e.g. between "To learn" and "Learned" words. */
export function LabeledDivider({ label }: { label: string }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[styles.row, { backgroundColor: colors.background }]}
      accessibilityRole="header"
    >
      <View style={[styles.line, { backgroundColor: colors.border }]} />
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <View style={[styles.line, { backgroundColor: colors.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  label: { fontSize: 13, fontWeight: '600' },
});
