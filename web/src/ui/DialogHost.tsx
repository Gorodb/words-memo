import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Button } from './Button';
import {
  closeDialog,
  useDialogs,
  type AlertOptions,
  type MenuAnchor,
  type MenuOptions,
  type ReaderOptions,
} from './dialogs';
import { FormDialog } from './FormDialog';
import { Markdown } from './Markdown';
import { Sheet } from './Sheet';

/** Renders the open dialogs, the newest on top. Mount once in the app. */
export function DialogHost() {
  const dialogs = useDialogs();
  return (
    <>
      {dialogs.map(dialog => {
        const close = () => closeDialog(dialog.id);
        switch (dialog.kind) {
          case 'alert':
            return <AlertDialog key={dialog.id} options={dialog.options} close={close} />;
          case 'menu':
            return <MenuDialog key={dialog.id} options={dialog.options} close={close} />;
          case 'form':
            return <FormDialog key={dialog.id} options={dialog.options} onClose={close} />;
          case 'reader':
            return <ReaderDialog key={dialog.id} options={dialog.options} close={close} />;
        }
      })}
    </>
  );
}

function AlertDialog({ options, close }: { options: AlertOptions; close: () => void }) {
  const buttons = options.buttons?.length ? options.buttons : [{ text: 'OK' }];
  const press = (onPress?: () => void) => {
    close();
    onPress?.();
  };
  // Dismissing counts as the cancel button (or the only button).
  const dismiss = () =>
    press(
      (buttons.find(b => b.style === 'cancel') ?? (buttons.length === 1 ? buttons[0] : undefined))
        ?.onPress,
    );
  return (
    <Sheet
      title={options.title}
      onDismiss={dismiss}
      closeButton={false}
      footer={buttons.map((b, i) => (
        <Button
          key={b.text}
          autoFocus={i === buttons.length - 1}
          variant={
            b.style === 'cancel'
              ? 'secondary'
              : b.style === 'destructive'
              ? 'danger'
              : 'primary'
          }
          className={b.style === 'destructive' ? 'bg-danger/10' : ''}
          onClick={() => press(b.onPress)}
        >
          {b.text}
        </Button>
      ))}
    >
      {options.message ? (
        <p className="pt-1 whitespace-pre-line text-muted">{options.message}</p>
      ) : null}
    </Sheet>
  );
}

function MenuDialog({ options, close }: { options: MenuOptions; close: () => void }) {
  if (options.anchor) {
    return <DropdownMenu options={options} anchor={options.anchor} close={close} />;
  }
  return (
    <Sheet title={options.title} onDismiss={close}>
      <div className="-mx-2 flex flex-col py-1">
        {options.items.map(item => (
          <button
            key={item.label}
            type="button"
            disabled={item.disabled}
            onClick={() => {
              // Runs after the menu has closed, so it can open another dialog.
              close();
              item.onPress();
            }}
            className={`rounded-xl px-3 py-3 text-left text-[15px] transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 ${
              item.destructive ? 'text-danger' : 'text-fg'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

const MARGIN = 8;
const GAP = 4;

/** Where the menu goes: under the anchor (above when it doesn't fit), inside the window. */
function dropdownPosition(anchor: MenuAnchor, width: number, height: number): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const box =
    anchor.kind === 'rect'
      ? anchor.rect
      : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
  // Buttons on the right half open leftwards, so the menu stays by the button.
  let left =
    anchor.kind === 'rect' && box.left + box.right > vw ? box.right - width : box.left;
  left = Math.max(MARGIN, Math.min(left, vw - width - MARGIN));
  const below = vh - box.bottom - GAP - MARGIN;
  const above = box.top - GAP - MARGIN;
  if (height <= below || below >= above) {
    return { left, top: box.bottom + GAP, maxHeight: below };
  }
  return { left, bottom: vh - box.top + GAP, maxHeight: above };
}

/**
 * Action menu as a dropdown at the button (or pointer) that opened it.
 * A click outside, Escape, scrolling or resizing closes it; arrow keys move
 * between the items.
 */
function DropdownMenu({
  options,
  anchor,
  close,
}: {
  options: MenuOptions;
  anchor: MenuAnchor;
  close: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden', left: 0, top: 0 });
  const dismiss = useRef(close);
  dismiss.current = close;

  useLayoutEffect(() => {
    const el = panel.current;
    if (el) {
      setStyle(dropdownPosition(anchor, el.offsetWidth, el.scrollHeight));
    }
  }, [anchor]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const onKey = (e: KeyboardEvent) => {
      const sheets = document.querySelectorAll('[data-sheet]');
      if (sheets[sheets.length - 1] !== panel.current) {
        return;
      }
      if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        dismiss.current();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = [
          ...(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
        ];
        const at = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === 'ArrowDown' ? at + 1 : at - 1;
        items[(next + items.length) % items.length]?.focus();
      }
    };
    const onScroll = (e: Event) => {
      if (!panel.current?.contains(e.target as Node)) {
        dismiss.current();
      }
    };
    const onResize = () => dismiss.current();
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      previous?.focus?.({ preventScroll: true });
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50"
      onPointerDown={e => {
        if (e.target === e.currentTarget) {
          close();
        }
      }}
      onContextMenu={e => {
        e.preventDefault();
        close();
      }}
    >
      <div
        ref={panel}
        data-sheet
        role="menu"
        aria-label={options.title}
        style={style}
        className="animate-fade fixed flex max-w-[18rem] min-w-[12rem] flex-col overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-xl"
      >
        {options.items.map(item => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              // Runs after the menu has closed, so it can open another dialog.
              close();
              item.onPress();
            }}
            className={`rounded-lg px-3 py-2 text-left text-sm transition outline-none hover:bg-surface-2 focus-visible:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 ${
              item.destructive ? 'text-danger' : 'text-fg'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ReaderDialog({ options, close }: { options: ReaderOptions; close: () => void }) {
  return (
    <Sheet
      title={options.title}
      onDismiss={close}
      wide
      footer={
        <Button variant="secondary" className="w-full sm:w-auto" onClick={close}>
          Close
        </Button>
      }
    >
      <div className="pt-2">
        <Markdown text={options.text} />
      </div>
    </Sheet>
  );
}
