import React, {
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetFooter,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
  type BottomSheetFooterProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../theme/ThemeProvider';
import { Markdown } from './Markdown';
import { TextButton } from './TextButton';

export interface MarkdownSheetOptions {
  title: string;
  /** Markdown. */
  text: string;
}

export interface MarkdownSheetHandle {
  open: (options: MarkdownSheetOptions) => void;
}

/** Space kept free above the sheet when it's at full height. */
const TOP_GAP = 24;
/** Height of the Close bar (the content is padded by it). */
const FOOTER_HEIGHT = 52;

const renderBackdrop = (props: BottomSheetBackdropProps) => (
  <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
);

/**
 * Read-only bottom sheet with a title and rendered Markdown (word
 * descriptions, rules). Close stays pinned at the bottom while long text scrolls.
 */
export function MarkdownSheet({
  ref,
}: {
  ref: React.Ref<MarkdownSheetHandle>;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const sheetRef = useRef<BottomSheetModal>(null);
  const [options, setOptions] = useState<MarkdownSheetOptions | null>(null);

  useImperativeHandle(ref, () => ({
    open: next => {
      setOptions(next);
      sheetRef.current?.present();
    },
  }));

  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) => (
      <BottomSheetFooter {...props}>
        <View
          style={[
            styles.footer,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              paddingBottom: insets.bottom,
            },
          ]}
        >
          <TextButton
            title="Close"
            onPress={() => sheetRef.current?.dismiss()}
          />
        </View>
      </BottomSheetFooter>
    ),
    [colors, insets.bottom],
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      backdropComponent={renderBackdrop}
      enableDynamicSizing
      topInset={insets.top}
      // Long texts scroll inside a sheet that stays below the status bar.
      maxDynamicContentSize={height - insets.top - TOP_GAP}
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.textSecondary }}
      footerComponent={renderFooter}
    >
      <BottomSheetScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + FOOTER_HEIGHT + 16 },
        ]}
      >
        <Text style={[styles.title, { color: colors.text }]}>
          {options?.title}
        </Text>
        {options ? <Markdown text={options.text} /> : null}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

/** `const reader = useMarkdownSheet(); … {reader.element} … reader.open({...})`. */
export function useMarkdownSheet() {
  const ref = useRef<MarkdownSheetHandle>(null);
  const open = useCallback(
    (options: MarkdownSheetOptions) => ref.current?.open(options),
    [],
  );
  return { open, element: <MarkdownSheet ref={ref} /> };
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 4 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  footer: {
    minHeight: FOOTER_HEIGHT,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
