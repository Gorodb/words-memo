import { Button } from './Button';
import {
  closeDialog,
  useDialogs,
  type AlertOptions,
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
