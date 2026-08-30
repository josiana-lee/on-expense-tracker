import { splitInstallment } from '../db/installments';
import { won } from '../lib/format';
import styles from './InstallmentChips.module.css';

type Props = {
  /** 1이면 일시불. */
  months: number;
  /** 일시불로 되돌린다. */
  onCash: () => void;
  /** 개월 수를 고르는 시트를 연다. */
  onOpen: () => void;
  /** 입력 중인 금액 문자열. 요약 줄을 만드는 데만 쓴다. */
  amount: string;
};

/** 결제수단 칩 바로 아래 줄. 신용카드를 고른 순간 나타난다.
 *
 *  금액 시트 안에 있던 것을 여기로 옮겼다. 사용자는 금액을 먼저 넣고 시트를
 *  닫은 뒤에 카드를 고르는데, 그 시점에는 시트가 이미 사라져 있어서 카드를
 *  눌러도 할부를 고를 자리가 화면 어디에도 없었다. 할부는 금액이 아니라
 *  결제수단에 딸린 선택이라, 결제수단 옆이 원래 자리다. */
export function InstallmentChips({ months, onCash, onOpen, amount }: Props) {
  const installment = months > 1;

  /** 회차가 어떻게 쪼개지는지 한 줄로. 나눠 담긴 결과를 나중에 달력에서 처음
   *  보게 되면, 사용자는 앱이 금액을 틀리게 적었다고 읽는다. */
  let summary: string | null = null;
  if (installment) {
    if (!amount) summary = '금액을 넣으면 회차가 어떻게 나뉘는지 보여줄게';
    else {
      try {
        const parts = splitInstallment(Number(amount), months);
        summary =
          parts[0] === parts[1]
            ? `매월 ${won(parts[1])}원씩 ${months}번 기록돼`
            : `첫 달 ${won(parts[0])}원, 이후 ${won(parts[1])}원씩 기록돼`;
      } catch (e) {
        summary = (e as Error).message;
      }
    }
  }

  return (
    <div className={styles.wrap}>
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
      {summary && <p className={styles.summary}>{summary}</p>}
    </div>
  );
}
