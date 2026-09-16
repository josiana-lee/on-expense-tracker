import { tapFeedback } from '../lib/haptics';
import styles from './Keypad.module.css';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'] as const;

export type KeypadKey = (typeof KEYS)[number];

type Props = {
  onPress: (key: KeypadKey) => void;
  compact?: boolean;
};

export function Keypad({ onPress, compact }: Props) {
  return (
    <div className={`${styles.grid} ${compact ? styles.compactGrid : ''}`}>
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          /* 진동은 여기서 울린다. 숫자판을 쓰는 화면이 일곱이고 앞으로 더
             생길 텐데, 부르는 쪽마다 넣게 하면 언젠가 한 화면만 조용해진다 —
             Sheet가 뒤로가기를 대신 맡는 것과 같은 이유다.
             onPress보다 먼저 친다. 누른 결과가 무엇이든(저장이 되든 자릿수
             제한에 막히든) 손가락에는 눌렸다는 사실만 돌려주면 된다. */
          onClick={() => {
            tapFeedback();
            onPress(k);
          }}
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
 *  Clearing the whole amount is not a key — the input screen's 지우기 button
 *  sets the amount directly. A `'clear'` branch used to live here for a design
 *  that was never built, which is worse than nothing: it reads as if this is
 *  where clearing happens, so the next person adds a key for it and the screen
 *  ends up with two paths that clear. */
export function applyKey(amount: string, key: KeypadKey): string {
  if (key === 'del') return amount.slice(0, -1);
  const next = (amount + key).replace(/^0+/, '');
  return next.length > MAX_AMOUNT_DIGITS ? amount : next;
}
