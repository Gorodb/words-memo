import { useEffect } from 'react';
import { useAppSelector } from '../store';

/** Puts `dark` on <html> for the dark theme (system / light / dark). */
export function useApplyTheme(): void {
  const mode = useAppSelector(s => s.settings.themeMode);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = mode === 'dark' || (mode === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dark ? '#0f1115' : '#f6f7f9');
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [mode]);
}
