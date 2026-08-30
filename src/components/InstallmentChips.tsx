import styles from './InstallmentChips.module.css';

type Props = {
  /** 1이면 일시불. */
  months: number;
  /** 일시불로 되돌린다. */
  onCash: () => void;
  /** 개월 수를 고르는 시트를 연다. */
  onOpen: () => void;
};

/** 결제수단 칩 바로 아래 줄. 신용카드를 고른 순간 나타난다.
 *
 *  금액 시트 안에 있던 것을 여기로 옮겼다. 사용자는 금액을 먼저 넣고 시트를
 *  닫은 뒤에 카드를 고르는데, 그 시점에는 시트가 이미 사라져 있어서 카드를
 *  눌러도 할부를 고를 자리가 화면 어디에도 없었다. 할부는 금액이 아니라
 *  결제수단에 딸린 선택이라, 결제수단 옆이 원래 자리다.
 *
 *  회차가 얼마씩 나뉘는지는 여기서 말하지 않는다. 그건 개월 수를 고르는
 *  시트에서 이미 보여줬고, 고르고 나온 사람에게 같은 계산을 한 번 더 읽히는
 *  건 참견이다. 칩에 적힌 "7개월 할부"면 무엇을 골랐는지는 충분하다. */
export function InstallmentChips({ months, onCash, onOpen }: Props) {
  const installment = months > 1;

  return (
    <div className={styles.row}>
      <button
        type="button"
        className={`${styles.chip} ${!installment ? styles.chipOn : ''}`}
        onClick={onCash}
      >
        일시불
      </button>
      <button
        type="button"
        className={`${styles.chip} ${installment ? styles.chipOn : ''}`}
        onClick={onOpen}
      >
        {installment ? `${months}개월 할부` : '할부'}
      </button>
    </div>
  );
}
