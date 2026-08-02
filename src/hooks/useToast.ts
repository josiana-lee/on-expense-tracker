import { useCallback, useEffect, useRef, useState } from 'react';

/** Total time a toast stays mounted. Toast.tsx switches to its exit
 *  animation shortly before this elapses, so the fade finishes right as
 *  this timer unmounts the node instead of it just vanishing mid-fade. */
export const TOAST_DURATION_MS = 2400;

export function useToast(durationMs = TOAST_DURATION_MS) {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const flash = useCallback(
    (msg: string) => {
      setText(msg);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setText(null), durationMs);
    },
    [durationMs],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { text, flash };
}
