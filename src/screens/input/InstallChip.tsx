import { useEffect, useRef } from 'react';
import styles from './InstallChip.module.css';

type Props = {
  /** 고른 신용카드의 이름. */
  name: string;
  /** 1이면 일시불. */
  months: number;
  /** 일시불로 되돌린다. */
  onCash: () => void;
  /** 할부 개월 수를 고르는 시트를 연다. */
  onOpen: () => void;
};

/** 고른 신용카드 칩. 카드를 누르면 이 칩이 옆으로 "또잉" 하고 늘어나면서 그 안에서 일시불인지
 *  할부인지 고른다.
 *
 *  전에는 카드 아래에 `일시불 | 할부` 칩 두 개가 그림자와 함께 떠서 `오늘 기록` 카드의 윗부분을
 *  덮었다. 할부는 결제수단에 딸린 선택이라 결제수단 칩 안으로 들어오는 게 맞고, 같은 줄 안에서
 *  해결되니 겹치는 것도 줄이 밀리는 것도 없다.
 *
 *  **귀여운 것은 늘어나는 순간뿐이고 쓰는 데는 아무것도 막지 않는다.** 애니메이션은 0.5초 안에 끝나고
 *  그 사이에도 눌린다. 기본은 일시불이라 대부분은 카드를 누르면 끝이다 — 할부를 쓸 때만 오른쪽 칸을
 *  누른다. 움직임 줄이기 설정에서는 전역 규칙(styles/animations.css)이 애니메이션을 거의 즉시 끝낸다. */
export function InstallChip({ name, months, onCash, onOpen }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const installment = months > 1;

  /* 늘어나는 동안 줄 오른쪽 끝(체크카드·농협카드 근처)을 넘어가 버릴 수 있다. 다 늘어난 뒤에 칩이
     줄 밖에 걸려 있으면 보이는 곳으로 당긴다. 개월 수를 고르면 "할부"가 "7개월 할부"로 넓어져서
     한 번 더 본다. */
  useEffect(() => {
    const t = window.setTimeout(() => {
      ref.current?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
    }, 460);
    return () => window.clearTimeout(t);
  }, [months]);

  return (
    <div ref={ref} className={styles.group}>
      <span className={styles.name}>{name}</span>
      <div className={styles.segs} role="group" aria-label={`${name} 결제 방식`}>
        <button
          type="button"
          className={`${styles.seg} ${!installment ? styles.segOn : ''}`}
          aria-pressed={!installment}
          onClick={onCash}
        >
          일시불
        </button>
        <button
          type="button"
          className={`${styles.seg} ${installment ? styles.segOn : ''}`}
          aria-pressed={installment}
          onClick={onOpen}
        >
          {installment ? `${months}개월 할부` : '할부'}
        </button>
      </div>
    </div>
  );
}
