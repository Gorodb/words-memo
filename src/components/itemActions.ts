import { Alert } from 'react-native';

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

interface ItemActionsOptions {
  name: string;
  onRename: () => void;
  /** Shown in the delete confirmation, e.g. "All its sets and words will be deleted." */
  deleteWarning: string;
  onDelete: () => void | Promise<void>;
}

/** Long-press menu for list items: Rename / Delete (with confirmation). */
export function showItemActions({
  name,
  onRename,
  deleteWarning,
  onDelete,
}: ItemActionsOptions): void {
  Alert.alert(name, undefined, [
    { text: 'Rename', onPress: onRename },
    {
      text: 'Delete',
      style: 'destructive',
      onPress: () => confirmDelete(name, deleteWarning, onDelete),
    },
    { text: 'Cancel', style: 'cancel' },
  ]);
}
