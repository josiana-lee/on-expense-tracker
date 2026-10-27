import { useEffect, useRef } from 'react';
import type { PaymentMethodRecord } from '../db/types';
import styles from './PaymentChips.module.css';

/** 고른 결제수단이 신용카드일 때 그 칩 안에서 일시불/할부를 고르는 데 필요한 것. */
export type InstallmentControl = {
  /** 1이면 일시불. */
  months: number;
  /** 개월 수를 치는 중인 글자. 치는 중이 아니면 null. 있으면 "할부" 칸이 포커스를 받은 모습으로
   *  바뀌어 치는 값을 보여준다(비어 있으면 "몇 개월"). */
  draft: string | null;
  /** 일시불로 되돌린다. */
  onCash: () => void;
  /** 할부 개월 수를 치러 간다. */
  onOpen: () => void;
};

type Props = {
  payments: Pick<PaymentMethodRecord, 'id' | 'name'>[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** 고른 결제수단이 할부를 쓸 수 있을 때만 넘긴다. 넘기면 그 칩이 옆으로 늘어나 일시불/할부를 품는다. */
  installment?: InstallmentControl;
  /** 바텀시트 안에서 쓰는 한 단계 작은 크기. 입력 탭은 기본 크기. */
  compact?: boolean;
};

/** 결제수단을 고르는 가로 칩 줄. 입력 탭, 달력의 추가/수정 시트, 반복 지출 시트가 모두 이걸 쓴다.
 *
 *  세 곳에 같은 칩이 따로 복사돼 있었다. 모양을 하나 고치면 세 곳을 따로 고쳐야 했고, 실제로 칩이
 *  카드 안에서 늘어나는 디자인을 넣을 때 입력 탭만 바뀌고 달력은 옛 모양으로 남았다. 디자인은 여기 한
 *  곳에서만 바뀐다. 크기만 `compact`로 나뉜다. */
export function PaymentChips({ payments, selectedId, onSelect, installment, compact }: Props) {
  return (
    <div className={`${styles.pays} ${compact ? styles.compact : ''}`}>
      {payments.map((p) => {
        const on = selectedId === p.id;
        /* 신용카드를 고르면 그 칩이 옆으로 늘어나 안에서 일시불/할부를 고른다. 할부는 금액이 아니라
           결제수단에 딸린 선택이라 칩 안이 제자리이고, 아래 카드를 덮는 것도 줄이 밀리는 것도 없다. */
        if (on && installment) {
          return <InstallChip key={p.id} name={p.name} {...installment} />;
        }
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            className={`${styles.pay} ${on ? styles.payOn : ''}`}
          >
            {p.name}
          </button>
        );
      })}
    </div>
  );
}

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
function InstallChip({ name, months, draft, onCash, onOpen }: { name: string } & InstallmentControl) {
  const ref = useRef<HTMLDivElement>(null);
  const installment = months > 1;
  /* 개월 수를 치는 중이면 이미 할부를 고른 것이다. months는 아직 1이어도 일시불은 꺼 둔다 — 둘 다
     켜져 있으면 칩이 지금 무엇을 고른 건지 두 말을 한다. */
  const editing = draft !== null;

  /* 늘어나는 동안 줄 오른쪽 끝(체크카드·농협카드 근처)을 넘어가 버릴 수 있다. 다 늘어난 뒤에 칩이
     줄 밖에 걸려 있으면 보이는 곳으로 당긴다. 개월 수를 고르면 "할부"가 "7개월 할부"로 넓어져서
     한 번 더 본다. */
  useEffect(() => {
    const t = window.setTimeout(() => {
      ref.current?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
    }, 460);
    return () => window.clearTimeout(t);
  }, [months, draft]);

  return (
    <div ref={ref} className={styles.group}>
      <span className={styles.name}>{name}</span>
      <div className={styles.segs} role="group" aria-label={`${name} 결제 방식`}>
        <button
          type="button"
          className={`${styles.seg} ${!installment && !editing ? styles.segOn : ''}`}
          aria-pressed={!installment && !editing}
          onClick={onCash}
        >
          일시불
        </button>
        <button
          /* 확정한 개월 수가 바뀌면 칸이 새로 그려져서 한 번 통통 튄다 — 고른 결과가 눈에 들어오게. */
          key={installment ? months : 'cash'}
          type="button"
          className={`${styles.seg} ${installment || editing ? styles.segOn : ''} ${
            installment && !editing ? styles.segPop : ''
          }`}
          aria-pressed={installment || editing}
          onClick={onOpen}
        >
          {editing ? (draft === '' ? '몇 개월' : `${draft}개월`) : installment ? `${months}개월 할부` : '할부'}
          {/* 입력 칸처럼 깜박이는 커서. 누르는 순간 "여기에 치는 중"이라는 포커스를 말한다. */}
          {editing && <span className={styles.caret} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
