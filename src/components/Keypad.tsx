import styles from './Keypad.module.css';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'] as const;

/** 점('.')은 외화 입력에서만 나온다 — `dot`을 켠 키패드가 `00` 자리에 내놓는다. */
export type KeypadKey = (typeof KEYS)[number] | '.';

type Props = {
  onPress: (key: KeypadKey) => void;
  compact?: boolean;
  /** `00` 자리를 소수점으로 바꾼다. 소수가 있는 외화를 칠 때만 켠다 — 원화에는 소수점이
   *  없으니 다른 곳의 키패드는 그대로다. */
  dot?: boolean;
  /** 지금은 칠 때가 아니라서 잠가 둔다 — 누를 수 없고 흐리게 보인다. 눌려도 아무 일도 안 일어나는 키패드는
   *  고장으로 보이고, 숫자가 보이지 않는 곳에 쌓이기도 한다. */
  disabled?: boolean;
};

export function Keypad({ onPress, compact, dot, disabled }: Props) {
  const keys: readonly KeypadKey[] = dot ? KEYS.map((k) => (k === '00' ? '.' : k)) : KEYS;
  return (
    <div className={`${styles.grid} ${compact ? styles.compactGrid : ''}`}>
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onPress(k)}
          disabled={disabled}
          aria-label={k === 'del' ? '지우기' : k === '.' ? '소수점' : k}
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
 *  Clearing the whole amount is not a key — the input screen's 지우기 button
 *  sets the amount directly. A `'clear'` branch used to live here for a design
 *  that was never built, which is worse than nothing: it reads as if this is
 *  where clearing happens, so the next person adds a key for it and the screen
 *  ends up with two paths that clear. */
export function applyKey(amount: string, key: KeypadKey): string {
  if (key === '.') return amount; // 원화에는 소수점이 없다. 눌릴 일도 없지만 받아서 무시한다.
  if (key === 'del') return amount.slice(0, -1);
  const next = (amount + key).replace(/^0+/, '');
  return next.length > MAX_AMOUNT_DIGITS ? amount : next;
}
