import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useAppTheme } from '../theme/ThemeProvider';

interface Props {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  /** primary: accent color + bold; secondary: muted color. */
  variant?: 'primary' | 'secondary';
}

export function TextButton({
  title,
  onPress,
  disabled,
  variant = 'primary',
}: Props) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text
        style={[
          styles.text,
          variant === 'primary'
            ? [styles.primary, { color: colors.primary }]
            : { color: colors.textSecondary },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingVertical: 8, paddingHorizontal: 12 },
  pressed: { opacity: 0.5 },
  disabled: { opacity: 0.35 },
  text: { fontSize: 16 },
  primary: { fontWeight: '600' },
});
