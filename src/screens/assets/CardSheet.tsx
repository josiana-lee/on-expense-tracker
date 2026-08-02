import { useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { setCardStatement } from '../../db/paymentMethods';
import type { PaymentMethodRecord } from '../../db/types';
import styles from './CardSheet.module.css';

type Props = {
  card: PaymentMethodRecord;
  onClose: () => void;
  onDone: (message: string) => void;
};

const MIN_DAY = 1;
const MAX_DAY = 28;

function clampDay(n: number): number {
  return Math.min(MAX_DAY, Math.max(MIN_DAY, n));
}

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.stepper}>
        <button
          type="button"
          className={styles.stepBtn}
          onClick={() => onChange(clampDay(value - 1))}
          aria-label={`${label} 하루 전으로`}
        >
          −
        </button>
        <span className={`${styles.stepValue} tabular`}>{value}일</span>
        <button
          type="button"
          className={styles.stepBtn}
          onClick={() => onChange(clampDay(value + 1))}
          aria-label={`${label} 하루 후로`}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function CardSheet({ card, onClose, onDone }: Props) {
  const [paymentDay, setPaymentDay] = useState(card.paymentDay ?? 14);
  // Cycles run back-to-back with no gap, so the statement period is fully
  // determined by its start day alone (see db/paymentMethods.ts). Defaulting
  // it to the payment day itself is the common real-world pattern — "결제일이
  // 9일이면 9일부터 다음달 8일까지가 사용기간" — and needs no extra convention.
  const [statementStartDay, setStatementStartDay] = useState(
    card.statementStartDay ?? card.paymentDay ?? 14,
  );
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await setCardStatement(card.id, paymentDay, statementStartDay);
      onDone('카드 결제 주기를 저장했어!');
      onClose();
    } catch {
      onDone('저장하지 못했어');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet label={`${card.name} 결제 주기 설정`} onClose={onClose}>
      <div className={styles.title}>{card.name} 결제 주기</div>
      <div className={styles.hint}>
        결제일과 사용기간 시작일을 알려주면 이번 달 결제액과 미결제 잔액을 나눠 보여줄게.
      </div>

      <Stepper label="결제일" value={paymentDay} onChange={setPaymentDay} />
      <Stepper label="사용기간 시작일" value={statementStartDay} onChange={setStatementStartDay} />

      <button type="button" className={styles.save} onClick={save} disabled={busy}>
        저장
      </button>
    </Sheet>
  );
}
