import { useEffect } from 'react';
import { useSettings } from './useSettings';

/** Applies settings.themeMode to the document root. 'system' tracks the OS
 *  scheme live, so a change while the app is open (or backgrounded) takes
 *  effect without a reload. */
export function useTheme(): void {
  const settings = useSettings();
  const mode = settings?.themeMode ?? 'system';

  useEffect(() => {
    const root = document.documentElement;

    const apply = (dark: boolean) => {
      if (dark) root.setAttribute('data-theme', 'dark');
      else root.removeAttribute('data-theme');
      // Native form controls (the reminder time picker's clock popup, etc.)
      // don't see our CSS variables — this is how they know to draw
      // themselves light or dark instead of defaulting to light always.
      root.style.setProperty('color-scheme', dark ? 'dark' : 'light');
    };

    if (mode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      apply(mq.matches);
      const onChange = (e: MediaQueryListEvent) => apply(e.matches);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }

    apply(mode === 'dark');
    return undefined;
  }, [mode]);
}
