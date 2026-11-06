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
  /** Fills the icon's shape with its color (e.g. a set star). */
  filled?: boolean;
  /** Touch area around the icon; smaller for icons that sit close together. */
  hitSlop?: number;
}

export function IconButton({
  icon: Icon,
  onPress,
  accessibilityLabel,
  color,
  size = 24,
  filled = false,
  hitSlop = 12,
}: Props) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Icon
        color={color ?? colors.primary}
        size={size}
        fill={filled ? color ?? colors.primary : 'none'}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { padding: 4 },
  pressed: { opacity: 0.5 },
});
