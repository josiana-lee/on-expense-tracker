import { useState } from 'react';
import { Keypad, applyKey } from '../../components/Keypad';
import { Sheet } from '../../components/Sheet';
import { setMonthlyBudget } from '../../db/budgets';
import type { DateStr } from '../../db/types';
import { won } from '../../lib/format';
import styles from './BudgetSheet.module.css';

type Props = {
  periodStart: DateStr;
  periodEnd: DateStr;
  periodLabel: string;
  current?: number;
  onClose: () => void;
  onDone: (message: string) => void;
};

export function BudgetSheet({ periodStart, periodEnd, periodLabel, current, onClose, onDone }: Props) {
  const [amount, setAmount] = useState(current ? String(current) : '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    if (!amount) {
      onDone('금액을 입력해줘');
      return;
    }
    setBusy(true);
    try {
      await setMonthlyBudget(periodStart, periodEnd, Number(amount));
      onDone('예산을 저장했어!');
      onClose();
    } catch {
      onDone('저장하지 못했어');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet label="예산 설정" onClose={onClose}>
      <div className={styles.head}>예산 설정</div>
      <div className={styles.sub}>{periodLabel} 기준</div>

      <div className={styles.amountRow}>
        <span className={`${styles.amount} tabular`}>{won(amount || '0')}</span>
        <span className={styles.unit}>원</span>
      </div>

      <Keypad compact onPress={(k) => setAmount((a) => applyKey(a, k))} />

      <button type="button" className={styles.save} onClick={save} disabled={busy}>
        저장
      </button>
    </Sheet>
  );
}
