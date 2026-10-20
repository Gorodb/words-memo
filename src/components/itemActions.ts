import { Alert } from 'react-native';
import { PinLimitError } from '../domain/pinning';
import type { ID } from '../domain/types';

/** "Delete X?" confirmation with a destructive Delete button. */
export function confirmDelete(
  name: string,
  warning: string,
  onDelete: () => void | Promise<void>,
): void {
  Alert.alert(`Delete "${name}"?`, warning, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onDelete },
  ]);
}

/** Menu label for pinning an item to the top of its list. */
export const pinLabel = (pinnedAt: number | null) =>
  pinnedAt === null ? 'Pin to top' : 'Unpin from top';

/** Toggles the pin; explains the limit instead of failing when it's reached. */
export async function togglePinned(
  setPinned: (id: ID, pinned: boolean) => Promise<void>,
  item: { id: ID; pinnedAt: number | null },
): Promise<void> {
  try {
    await setPinned(item.id, item.pinnedAt === null);
  } catch (e) {
    if (e instanceof PinLimitError) {
      Alert.alert('Pin limit reached', e.message);
    } else {
      throw e;
    }
  }
}
