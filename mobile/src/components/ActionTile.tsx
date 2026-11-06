import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAppTheme } from '../theme/ThemeProvider';

interface Props {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  onPress: () => void;
  disabled?: boolean;
}

/** A square-ish button with an icon, for the main actions of a screen. */
export function ActionTile({
  icon: Icon,
  title,
  subtitle,
  onPress,
  disabled,
}: Props) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={[styles.icon, { backgroundColor: colors.background }]}>
        <Icon color={colors.primary} size={22} />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.4 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  title: { fontSize: 16, fontWeight: '600' },
  subtitle: { fontSize: 13 },
});
