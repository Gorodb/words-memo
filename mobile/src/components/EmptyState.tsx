import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../theme/ThemeProvider';

interface Props {
  title: string;
  hint?: string;
  /** E.g. a TextButton shown below the text. */
  action?: React.ReactNode;
}

export function EmptyState({ title, hint, action }: Props) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {hint ? (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {hint}
        </Text>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  action: { marginTop: 12 },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  hint: { fontSize: 15, marginTop: 8, textAlign: 'center' },
});
