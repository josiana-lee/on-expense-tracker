import { useEffect, useRef } from 'react';

/** A stack of "what does back mean right now" handlers.
 *
 *  Android's back button has one meaning per moment, and the thing that owns
 *  it is whatever is visually on top — the sheet, then the sub-screen under
 *  it, then the tab. Rather than route that through App, which would have to
 *  know about every overlay in the app, each overlay declares its own dismiss
 *  while it is mounted and the top of the stack wins.
 *
 *  Module-level, not context: this is read from an event callback rather than
 *  during render, so a plain array keeps it correct without re-rendering
 *  anything when the stack changes.
 */
type Handler = () => void;

const stack: Handler[] = [];

/** Runs the topmost handler. Returns false when nothing wanted the press, so
 *  the caller can decide what back means at the root. */
export function handleBack(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top();
  return true;
}

/** Claims the back button while `active`, dismissing this layer.
 *
 *  The registration deliberately depends on `active` alone. Overlays pass
 *  inline closures, so depending on `onBack` would unregister and re-register
 *  on every render, briefly reordering the stack — the caller would have to
 *  remember to useCallback to avoid it, and forgetting would produce a bug
 *  that only shows up when two layers are open. The ref keeps the handler
 *  pointed at the current closure instead, so the indirection is what makes
 *  the narrow dependency safe rather than stale.
 */
export function useBackHandler(active: boolean, onBack: Handler): void {
  const latest = useRef(onBack);
  latest.current = onBack;

  useEffect(() => {
    if (!active) return undefined;

    const handler = () => latest.current();
    stack.push(handler);

    /* Removed by identity rather than popped: unmount order is not guaranteed
       to mirror mount order, so a screen that closes a sheet and itself in the
       same commit could otherwise drop a stranger's handler and leave its
       own behind. */
    return () => {
      const i = stack.lastIndexOf(handler);
      if (i !== -1) stack.splice(i, 1);
    };
  }, [active]);
}
