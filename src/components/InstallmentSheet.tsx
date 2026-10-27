import { useEffect, useState } from 'react';
import { applyMonthKey, installmentPreview } from '../db/installments';
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
  /** 치는 도중의 개월 수 글자. 시트가 화면의 아래쪽만 덮어서 위에 남은 칩이 치는 값을 따라 바뀌게 하려는 것이다
   *  (입력 탭의 카드 칩). 확정이 아니라서 닫기를 눌러 취소하면 이 값은 어디에도 남지 않는다. */
  onDraft?: (text: string) => void;
};

/** 할부 개월 수를 직접 입력하는 시트.
 *
 *  칩으로 몇 개만 내놓다가 직접 입력으로 바꿨다. 카드사마다 거는 개월 수가
 *  제각각이라(7·10·18·24개월) 무엇을 골라 내놔도 없는 것을 쓰는 사람이 나온다.
 *
 *  금액 시트와 같은 구조를 쓴다 — 사용자가 이미 아는 조작이고, 개월 수도 결국
 *  숫자 하나다. */
export function InstallmentSheet({ months, amount, onDone, onClose, onDraft }: Props) {
  const [text, setText] = useState(months > 1 ? String(months) : '');
  useEffect(() => {
    onDraft?.(text);
    // 칩이 따라가는 건 글자가 바뀔 때뿐이다. onDraft는 매 렌더 새로 만들어져도 다시 부르지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  const n = Number(text || '0');

  /* 여기서 말하는 건 두 가지뿐이다 — 얼마씩 나뉘는지, 그리고 왜 안 되는지.
     "개월 수를 넣어줘" 같은 안내는 넣지 않는다. 숫자판이 열려 있고 칸이 비어
     있으면 무엇을 하라는 건지는 보면 안다.
     자리는 비워두되 높이는 잡아둬서, 문구가 생길 때 숫자판이 밀리지 않는다. */
  const { text: note, bad } = installmentPreview(Number(amount), n);

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
