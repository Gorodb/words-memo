import type { ButtonHTMLAttributes, ComponentType, ReactNode } from 'react';
import type { LucideProps } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:brightness-110',
  secondary: 'bg-surface-2 text-fg hover:brightness-95 dark:hover:brightness-125',
  ghost: 'text-primary hover:bg-primary-soft',
  danger: 'text-danger hover:bg-danger/10',
};

export function Button({
  variant = 'primary',
  icon: Icon,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  icon?: ComponentType<LucideProps>;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition select-none disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
    >
      {Icon ? <Icon size={18} /> : null}
      {children}
    </button>
  );
}

/** Icon-only button; `label` is its accessible name and tooltip. */
export function IconButton({
  icon: Icon,
  label,
  size = 20,
  className = '',
  active = false,
  filled = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ComponentType<LucideProps>;
  label: string;
  size?: number;
  active?: boolean;
  /** Fills the icon's shape with its color (e.g. a word's star). */
  filled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={`inline-flex shrink-0 items-center justify-center rounded-full p-2 transition hover:bg-surface-2 disabled:opacity-40 ${
        active ? 'text-primary' : 'text-muted hover:text-fg'
      } ${className}`}
    >
      <Icon size={size} fill={filled ? 'currentColor' : 'none'} />
    </button>
  );
}
