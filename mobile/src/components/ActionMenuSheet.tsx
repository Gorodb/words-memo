import React, {
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../theme/ThemeProvider';

export interface ActionMenuItem {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface ActionMenuOptions {
  title?: string;
  items: ActionMenuItem[];
}

export interface ActionMenuHandle {
  open: (options: ActionMenuOptions) => void;
}

const renderBackdrop = (props: BottomSheetBackdropProps) => (
  <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
);

/**
 * Bottom sheet with a list of text actions. The chosen action runs after the
 * menu has closed, so it can open another sheet or an alert cleanly.
 */
export function ActionMenuSheet({ ref }: { ref: React.Ref<ActionMenuHandle> }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const pendingAction = useRef<(() => void) | null>(null);
  const [options, setOptions] = useState<ActionMenuOptions | null>(null);

  useImperativeHandle(ref, () => ({
    open: next => {
      pendingAction.current = null;
      setOptions(next);
      sheetRef.current?.present();
    },
  }));

  const choose = (item: ActionMenuItem) => {
    pendingAction.current = item.onPress;
    sheetRef.current?.dismiss();
  };

  const onDismiss = () => {
    const action = pendingAction.current;
    pendingAction.current = null;
    action?.();
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      backdropComponent={renderBackdrop}
      onDismiss={onDismiss}
      topInset={insets.top}
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.textSecondary }}
    >
      <BottomSheetView
        style={[styles.content, { paddingBottom: insets.bottom + 8 }]}
      >
        {options?.title ? (
          <Text style={[styles.title, { color: colors.textSecondary }]}>
            {options.title}
          </Text>
        ) : null}
        {options?.items.map(item => (
          <Pressable
            key={item.label}
            onPress={() => choose(item)}
            disabled={item.disabled}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ disabled: !!item.disabled }}
            style={({ pressed }) => [
              styles.item,
              pressed && styles.pressed,
              item.disabled && styles.disabled,
            ]}
          >
            <Text
              style={[
                styles.itemText,
                { color: item.destructive ? colors.danger : colors.text },
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

/** `const menu = useActionMenu(); … {menu.element} … menu.open({ items })`. */
export function useActionMenu() {
  const ref = useRef<ActionMenuHandle>(null);
  const open = useCallback(
    (options: ActionMenuOptions) => ref.current?.open(options),
    [],
  );
  return { open, element: <ActionMenuSheet ref={ref} /> };
}

const styles = StyleSheet.create({
  content: { paddingTop: 4 },
  title: {
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  item: { paddingHorizontal: 20, paddingVertical: 14 },
  pressed: { opacity: 0.5 },
  disabled: { opacity: 0.35 },
  itemText: { fontSize: 17 },
});
