import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useAppTheme } from '../theme/ThemeProvider';

export function SectionHeader({ title }: { title: string }) {
  const { colors } = useAppTheme();
  return (
    <Text style={[styles.header, { color: colors.textSecondary }]}>
      {title.toUpperCase()}
    </Text>
  );
}

const styles = StyleSheet.create({
  header: {
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
  },
});
