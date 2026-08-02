import { createContext, useContext } from 'react';

/** The app shell element. Overlays (popup, sheets, toast) portal into it so
 *  they cover the tab bar too, and the pop-from-tap animation measures its
 *  origin offset against this element's centre. */
export const ShellContext = createContext<HTMLElement | null>(null);

export function useShell(): HTMLElement | null {
  return useContext(ShellContext);
}

/** Offset of an element's centre from the shell's centre, in px.
 *  Feeds the --dx/--dy custom properties that popIn/popOut animate from. */
export function offsetFromShellCentre(
  el: HTMLElement,
  shell: HTMLElement | null,
): { dx: number; dy: number } {
  if (!shell) return { dx: 0, dy: 0 };
  const r = el.getBoundingClientRect();
  const s = shell.getBoundingClientRect();
  return {
    dx: Math.round(r.left + r.width / 2 - (s.left + s.width / 2)),
    dy: Math.round(r.top + r.height / 2 - (s.top + s.height / 2)),
  };
}
