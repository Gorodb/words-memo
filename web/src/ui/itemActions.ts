import { apiErrorCode } from '../api/api';
import type { ID } from '../domain/types';
import { errorText, showAlert } from './dialogs';

/** "Delete X?" confirmation with a destructive Delete button. */
export function confirmDelete(
  name: string,
  warning: string,
  onDelete: () => Promise<unknown> | void,
): void {
  showAlert(`Delete "${name}"?`, warning, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Delete',
      style: 'destructive',
      onPress: () =>
        Promise.resolve(onDelete()).catch(e => showAlert('Could not delete', errorText(e))),
    },
  ]);
}

/** Menu label for pinning an item to the top of its list. */
export const pinLabel = (pinnedAt: number | null) =>
  pinnedAt === null ? 'Pin to top' : 'Unpin from top';

/** Toggles the pin; explains the limit (409 PIN_LIMIT) instead of failing. */
export async function togglePinned(
  setPinned: (id: ID, pinned: boolean) => Promise<unknown>,
  item: { id: ID; pinnedAt: number | null },
): Promise<void> {
  try {
    await setPinned(item.id, item.pinnedAt === null);
  } catch (e) {
    showAlert(
      apiErrorCode(e) === 'PIN_LIMIT' ? 'Pin limit reached' : 'Could not pin',
      errorText(e),
    );
  }
}
