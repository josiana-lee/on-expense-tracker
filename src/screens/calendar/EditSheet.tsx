import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Keypad, applyKey } from '../../components/Keypad';
import { Sheet } from '../../components/Sheet';
import { deleteExpense, updateExpense } from '../../db/expenses';
import type { ExpenseRecord } from '../../db/types';
import { toMinor } from '../../db/types';
import { useCatalog } from '../../hooks/useCatalog';
import { won } from '../../lib/format';
import styles from './EditSheet.module.css';

type Props = {
  record: ExpenseRecord;
  onClose: () => void;
  onDone: (message: string) => void;
};

export function EditSheet({ record, onClose, onDone }: Props) {
  const { categories, byId, payments } = useCatalog();

  const [amount, setAmount] = useState(String(record.amount));
  const [categoryId, setCategoryId] = useState(record.categoryId);
  const [subLabel, setSubLabel] = useState(record.subLabel);
  const [paymentId, setPaymentId] = useState(record.paymentMethodId);
  const [busy, setBusy] = useState(false);

  const category = byId.get(categoryId);

  const pickCategory = (id: string) => {
    setCategoryId(id);
    // The sub-label belonged to the old category's list, so it stops applying.
    setSubLabel(undefined);
  };

  const save = async () => {
    if (busy) return;
    if (!amount) {
      onDone('금액이 비어 있어');
      return;
    }
    setBusy(true);
    try {
      await updateExpense(record.id, {
        amount: toMinor(Number(amount)),
        categoryId,
        subLabel,
        paymentMethodId: paymentId,
      });
      onDone('수정했어!');
      onClose();
    } catch {
      onDone('수정하지 못했어');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteExpense(record.id);
      onDone('삭제했어');
      onClose();
    } catch {
      onDone('삭제하지 못했어');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet label="기록 수정" onClose={onClose}>
      <div className={styles.head}>
        <span className={styles.title}>기록 수정</span>
        <button type="button" className={styles.delete} onClick={remove} disabled={busy}>
          삭제
        </button>
      </div>

      <div className={styles.amountRow}>
        <span className={styles.name}>{subLabel || category?.name}</span>
        <span className={`${styles.amount} tabular`}>{won(amount || '0')}원</span>
      </div>

      <div className={styles.cats}>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => pickCategory(c.id)}
            aria-label={c.name}
            aria-pressed={categoryId === c.id}
            className={`${styles.cat} ${categoryId === c.id ? styles.catOn : ''}`}
            style={{ background: c.colorHex }}
          >
            <Icon path={c.iconPath} size={21} strokeWidth={1.8} />
          </button>
        ))}
      </div>

      <div className={styles.pays}>
        {payments.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPaymentId(p.id)}
            className={`${styles.pay} ${paymentId === p.id ? styles.payOn : ''}`}
          >
            {p.name}
          </button>
        ))}
      </div>

      <Keypad compact onPress={(k) => setAmount((a) => applyKey(a, k))} />

      <button type="button" className={styles.save} onClick={save} disabled={busy}>
        수정 완료
      </button>
    </Sheet>
  );
}
