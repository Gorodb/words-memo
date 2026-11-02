import { useRef, type ComponentType, type ReactNode } from 'react';
import { apiErrorText } from '../api/api';
import { ChevronRight, Pin, type LucideProps } from 'lucide-react';

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <p className="text-lg font-semibold">{title}</p>
      {hint ? <p className="max-w-sm text-sm text-muted">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** "To learn (12)" between list parts. */
export function LabeledDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-1 pt-5 pb-2">
      <span className="text-xs font-semibold tracking-wide text-muted uppercase">
        {label}
      </span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="px-1 pt-6 pb-2 text-xs font-semibold tracking-wide text-muted uppercase">
      {title}
    </h2>
  );
}

/** Opens a menu on right click, or on a long press on touch screens. */
export function useLongPress(onMenu?: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const cancel = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  return {
    /** True right after a long press: skip the click that follows. */
    fired,
    handlers: onMenu
      ? {
          onContextMenu: (e: React.MouseEvent) => {
            e.preventDefault();
            cancel();
            onMenu();
          },
          onTouchStart: () => {
            fired.current = false;
            timer.current = setTimeout(() => {
              fired.current = true;
              onMenu();
            }, 550);
          },
          onTouchEnd: cancel,
          onTouchMove: cancel,
        }
      : {},
  };
}

/**
 * A tappable card row (folders, sets, settings). Right click or a long press
 * opens the item's menu, like the long press on the phone.
 */
export function ListRow({
  title,
  subtitle,
  pinned,
  chevron,
  onPress,
  onMenu,
  left,
  right,
  selected,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  pinned?: boolean;
  chevron?: boolean;
  onPress?: () => void;
  onMenu?: () => void;
  left?: ReactNode;
  right?: ReactNode;
  selected?: boolean;
}) {
  const longPress = useLongPress(onMenu);
  return (
    <div
      className={`group flex items-center gap-3 rounded-2xl border bg-surface px-4 py-3 transition select-none ${
        selected ? 'border-primary' : 'border-line'
      } ${onPress ? 'cursor-pointer hover:border-primary/50' : ''}`}
      role={onPress ? 'button' : undefined}
      tabIndex={onPress ? 0 : undefined}
      onClick={() => {
        if (!longPress.fired.current) {
          onPress?.();
        }
        longPress.fired.current = false;
      }}
      onKeyDown={e => {
        if (
          onPress &&
          (e.key === 'Enter' || e.key === ' ') &&
          e.target === e.currentTarget
        ) {
          e.preventDefault();
          onPress();
        }
      }}
      {...longPress.handlers}
    >
      {left}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {pinned ? (
            <Pin
              size={14}
              className="shrink-0 text-primary"
              aria-label="Pinned"
            />
          ) : null}
          <span className="truncate font-medium">{title}</span>
        </div>
        {subtitle ? (
          <div className="mt-0.5 text-sm text-muted">{subtitle}</div>
        ) : null}
      </div>
      {right}
      {chevron ? (
        <ChevronRight size={18} className="shrink-0 text-muted" />
      ) : null}
    </div>
  );
}

/** Big tile: Learn / Flashcards / Study words on the Set screen. */
export function ActionTile({
  icon: Icon,
  title,
  subtitle,
  onPress,
}: {
  icon: ComponentType<LucideProps>;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left sm:p-4 transition hover:border-primary/60 hover:shadow-sm"
    >
      <span className="flex size-10 shrink-0 sm:size-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <Icon size={22} />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="block truncate text-sm text-muted">{subtitle}</span>
      </span>
    </button>
  );
}

/** While a list loads, or when it couldn't be loaded. */
export function LoadState({ loading, error }: { loading: boolean; error?: unknown }) {
  if (loading || !error) {
    return (
      <div className="flex justify-center py-16" role="status" aria-label="Loading">
        <span className="size-7 animate-spin rounded-full border-[3px] border-line border-t-primary" />
      </div>
    );
  }
  return (
    <EmptyState
      title="Could not load"
      hint={apiErrorText(error)}
      action={
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white"
        >
          Try again
        </button>
      }
    />
  );
}
