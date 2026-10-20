import React, { useCallback, useImperativeHandle, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetFooter,
  BottomSheetModal,
  type BottomSheetBackdropProps,
  type BottomSheetFooterProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Square, SquareCheck } from 'lucide-react-native';
import { TextButton } from '../../components/TextButton';
import {
  listSetsForPicker,
  setInFolder,
  type PickableSet,
} from '../../db/repositories/sets';
import { useQuery } from '../../db/useQuery';
import type { ID, LanguageCode } from '../../domain/types';
import { useAppTheme } from '../../theme/ThemeProvider';
import { plural } from '../../utils/plural';

export interface SetPickerHandle {
  open: () => void;
}

interface Props {
  ref: React.Ref<SetPickerHandle>;
  folderId: ID;
  languageCode: LanguageCode;
  /** "New set" / "Create new set": the screen opens the name form. */
  onCreateSet: () => void;
}

const FOOTER_HEIGHT = 56;
const SNAP_POINTS = ['75%'];

const renderBackdrop = (props: BottomSheetBackdropProps) => (
  <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
);

/**
 * Add / remove sets of the folder's language to the folder. Every checkbox change is saved
 * immediately; "Done" only closes the sheet.
 */
export function SetPickerSheet({
  ref,
  folderId,
  languageCode,
  onCreateSet,
}: Props) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);

  const load = useCallback(
    () => listSetsForPicker(folderId, languageCode),
    [folderId, languageCode],
  );
  const { data: sets } = useQuery(load, ['sets', 'folder_sets', 'words']);

  useImperativeHandle(ref, () => ({
    open: () => sheetRef.current?.present(),
  }));

  const close = useCallback(() => sheetRef.current?.dismiss(), []);

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
          <TextButton title="Done" onPress={close} />
        </View>
      </BottomSheetFooter>
    ),
    [colors, insets.bottom, close],
  );

  const renderItem = ({ item }: { item: PickableSet }) => {
    const Icon = item.inFolder ? SquareCheck : Square;
    return (
      <Pressable
        onPress={() => setInFolder(folderId, item.id, !item.inFolder)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.inFolder }}
        accessibilityLabel={item.name}
        style={({ pressed }) => [
          styles.row,
          { borderBottomColor: colors.border },
          pressed && styles.pressed,
        ]}
      >
        <Icon
          color={item.inFolder ? colors.primary : colors.textSecondary}
          size={24}
        />
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>
            {item.name}
          </Text>
          <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
            {plural(item.wordCount, 'word')}
          </Text>
        </View>
      </Pressable>
    );
  };

  const isEmpty = sets !== undefined && sets.length === 0;

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      topInset={insets.top}
      backdropComponent={renderBackdrop}
      footerComponent={renderFooter}
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.textSecondary }}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          {isEmpty ? 'No sets' : 'Add sets'}
        </Text>
        {isEmpty ? null : (
          <TextButton title="+ New set" onPress={onCreateSet} />
        )}
      </View>
      {isEmpty ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            There are no sets in this language yet.
          </Text>
          <TextButton title="Create new set" onPress={onCreateSet} />
        </View>
      ) : (
        <BottomSheetFlatList
          data={sets ?? []}
          keyExtractor={(item: PickableSet) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingBottom: FOOTER_HEIGHT + insets.bottom + 8,
          }}
        />
      )}
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    paddingRight: 4,
    paddingBottom: 8,
  },
  title: { fontSize: 18, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pressed: { opacity: 0.6 },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16 },
  rowSubtitle: { fontSize: 13, marginTop: 2 },
  empty: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 32,
    gap: 12,
  },
  emptyText: { fontSize: 15, textAlign: 'center' },
  footer: {
    minHeight: FOOTER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
