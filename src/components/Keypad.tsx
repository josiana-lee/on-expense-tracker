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

/** The most digits an amount may have: 99,999,999,999원, a little under a
 *  thousand 억.
 *
 *  It was eight, which stops at 1억 — reachable by a car, a 전세 deposit, or
 *  tuition, and reaching it means the keypad simply stops responding with no
 *  explanation. Eleven is past anything a personal ledger records, and the
 *  amount card has type sizes down to 34px to keep it whole. Well inside
 *  Number.MAX_SAFE_INTEGER either way, so the stored value is exact. */
export const MAX_AMOUNT_DIGITS = 11;

/** Applies a keypad press to an amount string. Amounts are digit strings so a
 *  half-typed value keeps its own state.
 *
 *  The cap is checked against the result, not the input — '00' adds two digits
 *  at a time, so testing the length beforehand let ten digits become twelve.
 *
 *  'clear' wipes the whole amount. Backspacing out eleven digits one key at a
 *  time is the opposite of what this screen promises, and a wrong amount is
 *  usually wrong from the first digit rather than the last. */
export function applyKey(amount: string, key: string): string {
  if (key === 'clear') return '';
  if (key === 'del') return amount.slice(0, -1);
  const next = (amount + key).replace(/^0+/, '');
  return next.length > MAX_AMOUNT_DIGITS ? amount : next;
}
