import { useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { Stepper } from '../../components/Stepper';
import { setCardStatement } from '../../db/paymentMethods';
import type { PaymentMethodRecord } from '../../db/types';
import { useGuardedAction } from '../../hooks/useGuardedAction';
import styles from './CardSheet.module.css';

type Props = {
  card: PaymentMethodRecord;
  onClose: () => void;
  onDone: (message: string) => void;
};

const MIN_DAY = 1;
const MAX_DAY = 28;

export function CardSheet({ card, onClose, onDone }: Props) {
  const [paymentDay, setPaymentDay] = useState(card.paymentDay ?? 14);
  // Cycles run back-to-back with no gap, so the statement period is fully
  // determined by its start day alone (see db/paymentMethods.ts). Defaulting
  // it to the payment day itself is the common real-world pattern — "결제일이
  // 9일이면 9일부터 다음달 8일까지가 사용기간" — and needs no extra convention.
  const [statementStartDay, setStatementStartDay] = useState(
    card.statementStartDay ?? card.paymentDay ?? 14,
  );
  const { busy, guard } = useGuardedAction();

  const save = () => {
    guard(async () => {
      try {
        await setCardStatement(card.id, paymentDay, statementStartDay);
        onDone('카드 결제 주기를 저장했어!');
        onClose();
      } catch {
        onDone('저장하지 못했어');
      }
    });
  };

  return (
    <Sheet label={`${card.name} 결제 주기 설정`} onClose={onClose}>
      <div className={styles.title}>{card.name} 결제 주기</div>
      <div className={styles.hint}>
        결제일과 사용기간 시작일을 알려주면 이번 달 결제액과 미결제 잔액을 나눠 보여줄게.
      </div>

      <Stepper
        label="결제일"
        value={paymentDay}
        min={MIN_DAY}
        max={MAX_DAY}
        unit="일"
        onChange={setPaymentDay}
      />
      <Stepper
        label="사용기간 시작일"
        value={statementStartDay}
        min={MIN_DAY}
        max={MAX_DAY}
        unit="일"
        onChange={setStatementStartDay}
      />

      <button type="button" className={styles.save} onClick={save} disabled={busy}>
        저장
      </button>
    </Sheet>
  );
}
