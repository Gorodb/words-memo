import type { ComponentType, ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import {
  ArrowLeft,
  Folder,
  Languages,
  Layers,
  Settings,
  type LucideProps,
} from 'lucide-react';
import { setActiveLanguage } from '../store/actions';
import { useAppSelector } from '../store';
import { Logo } from './Logo';
import { useActiveLanguage, useLanguages } from './useLanguages';

const TABS: { to: string; label: string; icon: ComponentType<LucideProps> }[] = [
  { to: '/folders', label: 'Folders', icon: Folder },
  { to: '/sets', label: 'Sets', icon: Layers },
  { to: '/languages', label: 'Languages', icon: Languages },
  { to: '/settings', label: 'Settings', icon: Settings },
];

/**
 * Desktop: a sidebar with the sections and the active language.
 * Phones: a bottom tab bar, like the app.
 */
export function Layout() {
  return (
    <div className="min-h-full md:flex">
      <Sidebar />
      <main className="min-w-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-10">
        <Outlet />
      </main>
      <BottomTabs />
    </div>
  );
}

function Sidebar() {
  const languages = useLanguages();
  const active = useActiveLanguage();
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface px-3 py-5 md:flex">
      <div className="flex items-center gap-2.5 px-3 pb-6">
        <Logo className="size-9" />
        <span className="text-lg font-bold tracking-tight">Words</span>
      </div>
      <label className="px-3 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">
        Language
      </label>
      <div className="px-2 pb-5">
        <select
          value={active.code}
          onChange={e => setActiveLanguage(e.target.value)}
          className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-primary"
        >
          {languages.map(l => (
            <option key={l.code} value={l.code}>
              {l.name}
              {l.nativeName !== l.name ? ` · ${l.nativeName}` : ''}
            </option>
          ))}
        </select>
      </div>
      <nav className="flex flex-col gap-1">
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition ${
                isActive
                  ? 'bg-primary-soft text-primary'
                  : 'text-muted hover:bg-surface-2 hover:text-fg'
              }`
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto px-3">
        <AccountBadge />
      </div>
    </aside>
  );
}

function AccountBadge() {
  const email = useAppSelector(s => s.auth.email);
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate('/settings')}
      className="w-full truncate py-2 text-left text-xs text-muted hover:text-fg"
    >
      {email}
    </button>
  );
}

function BottomTabs() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {TABS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-medium ${
              isActive ? 'text-primary' : 'text-muted'
            }`
          }
        >
          <Icon size={22} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

/**
 * Page title row: sticky on phones (like a native header), with a back
 * button and the page's actions on the right.
 */
export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Where the back button goes; true = browser history. */
  back?: string | true;
  actions?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur md:static md:border-0 md:bg-transparent md:backdrop-blur-none">
      <div className="mx-auto flex min-h-14 max-w-3xl items-center gap-1 px-2 pt-[env(safe-area-inset-top)] md:min-h-0 md:px-6 md:pt-8 md:pb-2">
        {back ? (
          <button
            type="button"
            aria-label="Back"
            onClick={() =>
              // Opened from a link or a reload: there's no page to go back to.
              window.history.state?.idx > 0
                ? navigate(-1)
                : navigate(back === true ? '/' : back)
            }
            className="rounded-full p-2 text-fg hover:bg-surface-2"
          >
            <ArrowLeft size={22} />
          </button>
        ) : null}
        <div className={`min-w-0 flex-1 ${back ? '' : 'pl-2 md:pl-0'}`}>
          <h1 className="truncate text-lg font-semibold md:text-2xl md:font-bold">
            {title}
          </h1>
          {subtitle ? (
            <p className="truncate text-xs text-muted md:text-sm">{subtitle}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-1">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}

/** Centered content column under a PageHeader. */
export function PageBody({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-3xl px-3 pt-3 md:px-6">{children}</div>;
}
