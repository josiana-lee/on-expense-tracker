import styles from './Keypad.module.css';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'] as const;

type Props = {
  onPress: (key: string) => void;
  compact?: boolean;
};

export function Keypad({ onPress, compact }: Props) {
  return (
    <div className={`${styles.grid} ${compact ? styles.compactGrid : ''}`}>
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onPress(k)}
          aria-label={k === 'del' ? '지우기' : k}
          className={[styles.key, compact ? styles.compact : '', k === 'del' ? styles.muted : '']
            .filter(Boolean)
            .join(' ')}
        >
          {k === 'del' ? '←' : k}
        </button>
      ))}
    </div>
  );
}

/** Applies a keypad press to an amount string. Amounts are digit strings so a
 *  half-typed value keeps its own state; they cap at 8 digits (99,999,999원).
 *
 *  The cap is checked against the result, not the input — '00' adds two digits
 *  at a time, so testing the length beforehand let seven digits become nine.
 *
 *  'clear' wipes the whole amount. Backspacing out eight digits one key at a
 *  time is the opposite of what this screen promises, and a wrong amount is
 *  usually wrong from the first digit rather than the last. */
export function applyKey(amount: string, key: string): string {
  if (key === 'clear') return '';
  if (key === 'del') return amount.slice(0, -1);
  const next = (amount + key).replace(/^0+/, '');
  return next.length > 8 ? amount : next;
}
