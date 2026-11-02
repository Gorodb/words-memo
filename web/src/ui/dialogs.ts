/**
 * Dialogs opened from anywhere (event handlers, async flows): alerts with
 * buttons, action menus, forms and the read-only Markdown reader. The web
 * counterpart of the phone's Alert, useActionMenu, useFormSheet and
 * useMarkdownSheet. <DialogHost> renders them.
 */
import { useSyncExternalStore } from 'react';
import { apiErrorText } from '../api/api';
import type { FormChoice, FormOptions } from './FormDialog';

export interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface AlertOptions {
  title: string;
  message?: string;
  buttons?: AlertButton[];
}

export interface MenuItem {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface MenuOptions {
  title?: string;
  items: MenuItem[];
}

export interface ReaderOptions {
  title: string;
  text: string;
}

export type Dialog =
  | { id: number; kind: 'alert'; options: AlertOptions }
  | { id: number; kind: 'menu'; options: MenuOptions }
  | { id: number; kind: 'form'; options: FormOptions | FormChoice }
  | { id: number; kind: 'reader'; options: ReaderOptions };

type NewDialog = Dialog extends infer D
  ? D extends Dialog
    ? Omit<D, 'id'>
    : never
  : never;

let dialogs: Dialog[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(l => l());
}

function push(dialog: NewDialog): number {
  const id = nextId++;
  dialogs = [...dialogs, { ...dialog, id } as Dialog];
  emit();
  return id;
}

export function closeDialog(id: number): void {
  dialogs = dialogs.filter(d => d.id !== id);
  emit();
}

export function useDialogs(): Dialog[] {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => dialogs,
  );
}

/** An alert with buttons (default: OK). A button's onPress runs after it closes. */
export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
): void {
  push({ kind: 'alert', options: { title, message, buttons } });
}

/** Resolves true when the confirm button was pressed. */
export function ask(
  title: string,
  message: string,
  confirm: string,
  destructive = false,
): Promise<boolean> {
  return new Promise(resolve =>
    push({
      kind: 'alert',
      options: {
        title,
        message,
        buttons: [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          {
            text: confirm,
            style: destructive ? 'destructive' : 'default',
            onPress: () => resolve(true),
          },
        ],
      },
    }),
  );
}

/** Action menu; the chosen item runs after the menu has closed. */
export function showMenu(options: MenuOptions): void {
  push({ kind: 'menu', options });
}

export function showForm(options: FormOptions | FormChoice): void {
  push({ kind: 'form', options });
}

/** Long Markdown text, read only (word descriptions, rules). */
export function showReader(options: ReaderOptions): void {
  push({ kind: 'reader', options });
}

/** Readable text of an error (the server's message for failed requests). */
export const errorText = (e: unknown) => apiErrorText(e);

/** For actions started from menus: shows a failure instead of losing it. */
export function attempt(title: string, work: Promise<unknown>): void {
  work.catch(e => showAlert(title, errorText(e)));
}
