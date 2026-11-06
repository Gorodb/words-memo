import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, Pin } from 'lucide-react-native';
import { useAppTheme } from '../theme/ThemeProvider';

interface Props {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  /** Shows a chevron, for rows that open another screen. */
  chevron?: boolean;
  /** Shows a pin before the title (pinned to the top of the list). */
  pinned?: boolean;
  /** "card": separate rounded card with space around it (folders, sets). */
  variant?: 'row' | 'card';
  onPress?: () => void;
  onLongPress?: () => void;
}

export function ListRow({
  title,
  subtitle,
  right,
  chevron,
  pinned,
  variant = 'row',
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
        { backgroundColor: colors.surface, borderColor: colors.border },
        variant === 'card' ? styles.card : styles.divided,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.text}>
        <View style={styles.titleRow}>
          {pinned ? (
            <Pin
              color={colors.primary}
              fill={colors.primary}
              size={14}
              accessibilityLabel="Pinned"
            />
          ) : null}
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        </View>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? <ChevronRight color={colors.textSecondary} size={20} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  divided: { borderBottomWidth: StyleSheet.hairlineWidth },
  card: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: { opacity: 0.6 },
  text: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 16, flexShrink: 1 },
  subtitle: { fontSize: 13, marginTop: 2 },
});
