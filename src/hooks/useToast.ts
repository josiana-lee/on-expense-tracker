import { useCallback, useEffect, useRef, useState } from 'react';

export function useToast(durationMs = 2400) {
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
