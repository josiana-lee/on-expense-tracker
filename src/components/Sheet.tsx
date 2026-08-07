import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useShell } from '../shell/ShellContext';
import { useBackHandler } from '../shell/useBackHandler';
import styles from './Sheet.module.css';

type Props = {
  onClose: () => void;
  label: string;
  children: ReactNode;
};

/** Bottom sheet with a tap-to-dismiss scrim. Portals into the app shell so it
 *  covers the tab bar.
 *
 *  Claiming the Android back button here rather than in each caller covers
 *  every sheet in the app at once, and means a new sheet gets the behaviour
 *  without anyone remembering to add it. */
export function Sheet({ onClose, label, children }: Props) {
  const shell = useShell();
  /* Before the early return, so the hook order stays stable across the render
     where `shell` is still null. */
  useBackHandler(true, onClose);

  if (!shell) return null;

  return createPortal(
    <>
      <button type="button" className={styles.scrim} onClick={onClose} aria-label="닫기" />
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </>,
    shell,
  );
}
