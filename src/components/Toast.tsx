import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useShell } from '../shell/ShellContext';
import { TOAST_DURATION_MS } from '../hooks/useToast';
import { Icon } from './Icon';
import styles from './Toast.module.css';

const CHECK = 'M4 12.5l5.5 5.5L20 6';

/** How long the exit fade takes — kept short and separate from the entrance
 *  animation (see Toast.module.css) rather than one keyframe spanning the
 *  whole visible lifetime. An animation that ends on opacity:0 collapses to
 *  that end state almost instantly under prefers-reduced-motion, which is
 *  fine for a three-hundred-millisecond exit but would make the entrance
 *  invisible if the same keyframe covered both. */
const EXIT_MS = 320;

export function Toast({ text }: { text: string }) {
  const shell = useShell();
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    setExiting(false);
    const t = window.setTimeout(() => setExiting(true), TOAST_DURATION_MS - EXIT_MS);
    return () => window.clearTimeout(t);
  }, [text]);

  if (!shell) return null;

  return createPortal(
    <div
      className={`${styles.toast} ${exiting ? styles.exiting : ''}`}
      role="status"
      aria-live="polite"
    >
      <Icon path={CHECK} size={17} stroke="#22b573" strokeWidth={3} />
      {text}
    </div>,
    shell,
  );
}
