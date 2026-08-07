import { Icon } from './Icon';
import styles from './ClearAmount.module.css';

const CLEAR_ICON = 'M6 6l12 12M18 6L6 18';

type Props = {
  onClear: () => void;
};

/** Wipes an amount in one tap, for the keypads that would otherwise need
 *  eleven presses of backspace.
 *
 *  Shared rather than repeated per sheet because it belongs beside every
 *  keypad, and the case is strongest on the ones that edit: those open with a
 *  full number already in place, so starting over is the common move rather
 *  than the rare one.
 *
 *  Callers render it only while there is something to clear — a button that
 *  does nothing is worse than no button, and its disappearance is what tells
 *  the user the field is empty. */
export function ClearAmount({ onClear }: Props) {
  return (
    <button
      type="button"
      className={styles.clear}
      onClick={onClear}
      aria-label="금액 전체 지우기"
    >
      <Icon path={CLEAR_ICON} size={12} stroke="currentColor" strokeWidth={2.6} />
    </button>
  );
}
