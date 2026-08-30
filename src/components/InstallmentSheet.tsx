import { useState } from 'react';
import { applyMonthKey, splitInstallment } from '../db/installments';
import { won } from '../lib/format';
import { ClearAmount } from './ClearAmount';
import { Keypad } from './Keypad';
import { Sheet } from './Sheet';
import styles from './InstallmentSheet.module.css';

type Props = {
  /** 현재 개월 수. 1(일시불)이면 빈 칸에서 시작한다. */
  months: number;
  /** 결제 총액 문자열. 미리보기에만 쓴다. */
  amount: string;
  /** 확정된 개월 수. 1이면 일시불로 되돌린다. */
  onDone: (months: number) => void;
  onClose: () => void;
};

/** 할부 개월 수를 직접 입력하는 시트.
 *
 *  칩으로 몇 개만 내놓다가 직접 입력으로 바꿨다. 카드사마다 거는 개월 수가
 *  제각각이라(7·10·18·24개월) 무엇을 골라 내놔도 없는 것을 쓰는 사람이 나온다.
 *
 *  금액 시트와 같은 구조를 쓴다 — 사용자가 이미 아는 조작이고, 개월 수도 결국
 *  숫자 하나다. */
export function InstallmentSheet({ months, amount, onDone, onClose }: Props) {
  const [text, setText] = useState(months > 1 ? String(months) : '');
  const n = Number(text || '0');

  /* 확정 전에 무엇이 저장될지 보여준다. 여기서 막지 않으면 금액이 회차 수보다
     적을 때 "추가!"를 눌러야만 이유를 알게 된다. */
  let note: string;
  let bad = false;
  if (n <= 1) {
    note = '개월 수를 넣어줘. 1이나 비워두면 일시불이야';
  } else if (!amount) {
    note = `${n}개월로 나눠서 기록할게. 금액은 이따 넣어도 돼`;
  } else {
    try {
      const parts = splitInstallment(Number(amount), n);
      note =
        parts[0] === parts[1]
          ? `매월 ${won(parts[1])}원씩 ${n}번 기록돼`
          : `첫 달 ${won(parts[0])}원, 이후 ${won(parts[1])}원씩 기록돼`;
    } catch (e) {
      note = (e as Error).message;
      bad = true;
    }
  }

  return (
    <Sheet label="할부 개월 수" onClose={onClose}>
      <div className={styles.head}>
        <span className={styles.label}>할부 개월 수</span>
        <span className={`${styles.value} tabular`}>{text || '0'}개월</span>
        {text && <ClearAmount onClear={() => setText('')} />}
      </div>

      <p className={`${styles.note} ${bad ? styles.noteBad : ''}`}>{note}</p>

      <Keypad onPress={(k) => setText((t) => applyMonthKey(t, k))} />

      <button
        type="button"
        className={styles.done}
        /* 잘못된 조합으로는 닫지 않는다. 닫아버리면 화면에는 "3개월 할부"라고
           적혀 있는데 저장은 실패하는 상태가 된다. */
        disabled={bad}
        onClick={() => {
          onDone(n > 1 ? n : 1);
          onClose();
        }}
      >
        완료
      </button>
    </Sheet>
  );
}
