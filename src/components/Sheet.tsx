import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useShell } from '../shell/ShellContext';
import styles from './Sheet.module.css';

type Props = {
  onClose: () => void;
  label: string;
  children: ReactNode;
};

/** Bottom sheet with a tap-to-dismiss scrim. Portals into the app shell so it
 *  covers the tab bar. */
export function Sheet({ onClose, label, children }: Props) {
  const shell = useShell();
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
