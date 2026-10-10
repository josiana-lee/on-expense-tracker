import { useRef, useState } from 'react';
import { blurOnEnter } from '../lib/keyboard';
import styles from './Stepper.module.css';
import { cleanDraft, readDraft, step } from './stepperInput';

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  /** Appended after the number, e.g. '일'. */
  unit?: string;
  onChange: (value: number) => void;
};

export function Stepper({ label, value, min, max, unit = '', onChange }: Props) {
  /* 숫자를 눌러 직접 적는 동안의 글자. null이면 적는 중이 아니다.
     누르면 칸이 비고 원래 값이 흐리게 비쳐 보인다 — 전체 선택은 안드로이드
     WebView에서 손을 떼는 순간 풀려서, 비우는 쪽이 어느 기기에서나 같게 동작한다. */
  const [draft, setDraft] = useState<string | null>(null);
  const before = useRef(value);

  const type = (text: string) => {
    const clean = cleanDraft(text, max);
    setDraft(clean);
    /* 적는 즉시 값에 반영한다. 칸을 떠나는 순간에만 반영하면, 뒤로 가기로 시트를
       닫을 때처럼 칸을 떠나지 않고 사라지는 경우에 적은 값이 없던 일이 된다. */
    const next = readDraft(clean, min, max);
    if (next !== null) onChange(next);
  };

  const leave = () => {
    /* 지워서 비운 채로 떠나면 누르기 전 값으로 돌린다. 적다가 지운 중간 값이
       남아 있으면 안 된다. */
    if (readDraft(draft ?? '', min, max) === null && value !== before.current) {
      onChange(before.current);
    }
    setDraft(null);
  };

  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.btn}
          onClick={() => onChange(step(value, -1, min, max))}
          aria-label={`${label} 감소`}
        >
          −
        </button>
        <label className={styles.value}>
          <input
            className={`${styles.input} tabular`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            enterKeyHint="done"
            aria-label={label}
            value={draft ?? String(value)}
            placeholder={String(value)}
            onFocus={() => {
              before.current = value;
              setDraft('');
            }}
            onChange={(e) => type(e.target.value)}
            onBlur={leave}
            onKeyDown={blurOnEnter}
          />
          {unit}
        </label>
        <button
          type="button"
          className={styles.btn}
          onClick={() => onChange(step(value, 1, min, max))}
          aria-label={`${label} 증가`}
        >
          +
        </button>
      </div>
    </div>
  );
}
