import { useCallback, useRef, useState } from 'react';

/** Guards an async action against firing twice from the same click burst.
 *
 *  A React state flag alone doesn't work for this: `setBusy(true)` doesn't
 *  reach the DOM (or even this closure's next read) until React commits,
 *  which happens after the event handler returns. Two synchronous clicks in
 *  the same tick — a real double-tap, not just a slow render — both read the
 *  same stale `busy === false` and both go through. A ref has no such delay:
 *  it's checked and set before anything async happens, so the second call
 *  sees the lock immediately. `busy` is still exposed for the disabled prop,
 *  it's just not what does the actual guarding. */
export function useGuardedAction() {
  const [busy, setBusy] = useState(false);
  const lockRef = useRef(false);

  const guard = useCallback((action: () => Promise<void>) => {
    if (lockRef.current) return;
    lockRef.current = true;
    setBusy(true);
    void action().finally(() => {
      lockRef.current = false;
      setBusy(false);
    });
  }, []);

  return { busy, guard };
}
