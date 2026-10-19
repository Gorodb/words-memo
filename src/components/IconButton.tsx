import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAppTheme } from '../theme/ThemeProvider';

interface Props {
  icon: LucideIcon;
  onPress: () => void;
  accessibilityLabel: string;
  /** Defaults to the primary color. */
  color?: string;
  size?: number;
}

export function IconButton({
  icon: Icon,
  onPress,
  accessibilityLabel,
  color,
  size = 24,
}: Props) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Icon color={color ?? colors.primary} size={size} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { padding: 4 },
  pressed: { opacity: 0.5 },
});
