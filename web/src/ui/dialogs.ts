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

/** Where a dropdown menu opens: under a button, or at the pointer (right click). */
export type MenuAnchor =
  | { kind: 'rect'; rect: DOMRect }
  | { kind: 'point'; x: number; y: number };

export interface MenuOptions {
  title?: string;
  items: MenuItem[];
  /**
   * Set by showMenu from the click that opened it: a dropdown there.
   * Without one (long press on touch screens) the menu is a bottom sheet.
   */
  anchor?: MenuAnchor;
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

/**
 * The click or right click being handled right now. Recorded in the capture
 * phase, before React's handlers run, and cleared after the event, so a
 * showMenu called from a handler knows what opened it.
 */
let currentAnchor: MenuAnchor | undefined;

function recordAnchor(e: MouseEvent) {
  if (e.type === 'contextmenu') {
    currentAnchor = { kind: 'point', x: e.clientX, y: e.clientY };
  } else {
    const target = e.target instanceof Element ? e.target : null;
    const button = target?.closest('button, [role="button"], [role="menuitem"]');
    currentAnchor = button
      ? { kind: 'rect', rect: button.getBoundingClientRect() }
      : { kind: 'point', x: e.clientX, y: e.clientY };
  }
  setTimeout(() => {
    currentAnchor = undefined;
  }, 0);
}

if (typeof window !== 'undefined') {
  window.addEventListener('click', recordAnchor, true);
  window.addEventListener('contextmenu', recordAnchor, true);
}

/**
 * Action menu; the chosen item runs after the menu has closed. Opened by a
 * click it is a dropdown at the clicked button (or the pointer, for a right
 * click); opened by a long press on a touch screen it is a bottom sheet.
 */
export function showMenu(options: MenuOptions): void {
  push({ kind: 'menu', options: { anchor: currentAnchor, ...options } });
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
