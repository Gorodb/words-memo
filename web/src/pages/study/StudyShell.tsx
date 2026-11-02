import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useNavigate } from 'react-router';

/** Full-screen frame of the learning screens: [×] title · counter · actions. */
export function StudyShell({
  title,
  counter,
  actions,
  closeTo,
  children,
}: {
  title: ReactNode;
  counter?: ReactNode;
  actions?: ReactNode;
  /** Where × goes when there's no history (opened by link or reload). */
  closeTo: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const close = () =>
    window.history.state?.idx > 0 ? navigate(-1) : navigate(closeTo, { replace: true });
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex min-h-14 max-w-3xl items-center gap-2 px-2 md:px-4">
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="rounded-full p-2 hover:bg-surface-2"
          >
            <X size={22} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-semibold">{title}</h1>
            {counter ? <p className="text-xs text-muted">{counter}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6">
        {children}
      </div>
    </div>
  );
}

/** Colors of answer states, shared by the study screens. */
export const STATUS_CLASSES = {
  correct: 'border-success bg-success/10 text-success',
  assisted: 'border-assisted bg-assisted/10 text-assisted',
  wrong: 'border-danger bg-danger/10 text-danger',
} as const;
