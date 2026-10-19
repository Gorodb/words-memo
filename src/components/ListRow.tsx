import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useAppTheme } from '../theme/ThemeProvider';

interface Props {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  /** Shows a chevron, for rows that open another screen. */
  chevron?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}

export function ListRow({
  title,
  subtitle,
  right,
  chevron,
  onPress,
  onLongPress,
}: Props) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface, borderBottomColor: colors.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.text}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? (
        <ChevronRight color={colors.textSecondary} size={20} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pressed: { opacity: 0.6 },
  text: { flex: 1 },
  title: { fontSize: 16 },
  subtitle: { fontSize: 13, marginTop: 2 },
});
