import styles from './InstallmentChips.module.css';

type Props = {
  /** 1이면 일시불. */
  months: number;
  /** 일시불로 되돌린다. */
  onCash: () => void;
  /** 할부를 고른다 — 개월 칸이 있으면 거기로 초점을 옮기고, 없으면 시트를 연다. */
  onOpen: () => void;
  /** 개월 수를 이 줄에서 바로 받는 모드. 넘기지 않으면 칩 두 개만 그린다.
   *
   *  입력 탭은 넘기지 않는다. 거기서는 이 줄이 결제수단 칩 밑에 떠 있는
   *  레이어라 늘어날 자리가 마땅치 않고, 화면 위에 시트가 하나 뜨는 건
   *  겹치지도 않는다. 기록 수정 화면은 이미 시트라서 그 위에 시트를 또
   *  띄우면 스크림과 둥근 모서리가 두 겹이 된다 — 그쪽만 이 모드를 쓴다. */
  field?: {
    /** 입력 중인 개월 수 문자열. 빈 문자열이면 아직 아무것도 안 쳤다. */
    text: string;
    /** 숫자판이 지금 이 칸을 치고 있나. */
    active: boolean;
  };
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
export function InstallmentChips({ months, onCash, onOpen, field }: Props) {
  const installment = months > 1;

  return (
    <div className={styles.row}>
      <button
        type="button"
        /* 개월 수를 치는 중이면 일시불은 꺼둔다. months는 아직 1이지만
           사용자는 이미 할부를 고른 상태다 — 둘 다 켜져 있으면 지금 무엇을
           고른 건지 한 줄이 두 말을 한다. */
        className={`${styles.chip} ${!installment && !field?.active ? styles.chipOn : ''}`}
        onClick={onCash}
      >
        일시불
      </button>
      <button
        type="button"
        className={`${styles.chip} ${installment || field?.active ? styles.chipOn : ''}`}
        onClick={onOpen}
      >
        {/* 옆 칸이 개월 수를 말하고 있으면 칩은 "할부"로만 둔다. 둘 다 적으면
            같은 숫자가 한 줄에 두 번 나온다. */}
        {installment && !field ? `${months}개월 할부` : '할부'}
      </button>
      {/* 칸은 할부를 골랐거나 고르는 중일 때만 나온다. 일시불인데 빈 칸이 늘
          떠 있으면 채워야 하는 것처럼 보인다. */}
      {field !== undefined && (installment || field.active) && (
        <button
          type="button"
          className={`${styles.field} ${field.active ? styles.fieldOn : ''}`}
          onClick={onOpen}
          aria-label="할부 개월 수"
          aria-pressed={field.active}
        >
          <span className={`${styles.fieldNum} tabular`}>{field.text || '0'}</span>
          개월
        </button>
      )}
    </div>
  );
}
