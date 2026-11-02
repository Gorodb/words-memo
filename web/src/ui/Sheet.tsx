import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Modal shell: a bottom sheet on phones, a centered dialog on wider screens.
 * Escape and a click on the backdrop dismiss it.
 */
export function Sheet({
  title,
  onDismiss,
  children,
  footer,
  wide = false,
  closeButton = true,
}: {
  title?: ReactNode;
  onDismiss: () => void;
  children: ReactNode;
  /** Pinned below the scrolling content (buttons). */
  footer?: ReactNode;
  wide?: boolean;
  closeButton?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    // Only the top-most sheet reacts: each new one is rendered last.
    const onKey = (e: KeyboardEvent) => {
      const sheets = document.querySelectorAll('[data-sheet]');
      if (e.key === 'Escape' && sheets[sheets.length - 1] === panel.current) {
        e.stopPropagation();
        dismiss.current();
      }
    };
    document.addEventListener('keydown', onKey);
    const previous = document.activeElement as HTMLElement | null;
    if (!panel.current?.contains(document.activeElement)) {
      panel.current?.focus();
    }
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="animate-fade fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-6">
      <div className="absolute inset-0" onClick={onDismiss} aria-hidden />
      <div
        ref={panel}
        data-sheet
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`animate-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-surface shadow-2xl outline-none sm:rounded-2xl ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'
        }`}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line sm:hidden" />
        {title !== undefined || closeButton ? (
          <div className="flex shrink-0 items-start gap-2 px-5 pt-3 pb-1 sm:pt-5">
            <h2 className="min-w-0 flex-1 text-lg font-semibold break-words">
              {title}
            </h2>
            {closeButton ? (
              <button
                type="button"
                onClick={onDismiss}
                aria-label="Close"
                className="-mr-2 rounded-full p-1.5 text-muted hover:bg-surface-2"
              >
                <X size={20} />
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          {children}
        </div>
        {footer ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
