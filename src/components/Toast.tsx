import { createPortal } from 'react-dom';
import { useShell } from '../shell/ShellContext';
import { Icon } from './Icon';
import styles from './Toast.module.css';

const CHECK = 'M4 12.5l5.5 5.5L20 6';

export function Toast({ text }: { text: string }) {
  const shell = useShell();
  if (!shell) return null;

  return createPortal(
    <div className={styles.toast} role="status" aria-live="polite">
      <Icon path={CHECK} size={17} stroke="#8BE8B0" strokeWidth={3} />
      {text}
    </div>,
    shell,
  );
}
