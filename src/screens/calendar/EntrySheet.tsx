import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Keypad, applyKey } from '../../components/Keypad';
import { Sheet } from '../../components/Sheet';
import { parseDateStr } from '../../db/date';
import { addExpense, deleteExpense, updateExpense } from '../../db/expenses';
import type { DateStr, ExpenseRecord } from '../../db/types';
import { toMinor } from '../../db/types';
import { useCatalog } from '../../hooks/useCatalog';
import { useSettings } from '../../hooks/useSettings';
import { won } from '../../lib/format';
import styles from './EntrySheet.module.css';

type Props = {
  /** An existing row to edit, or null to create one on `date`. */
  record: ExpenseRecord | null;
  /** Which day a newly created record lands on. */
  date: DateStr;
  onClose: () => void;
  onDone: (message: string) => void;
};

/** Records made here carry the current clock time. For today that is exactly
 *  right; for a past or future day the time is arbitrary but harmless, since
 *  nothing in the app groups by time of day. */
function stampFor(date: DateStr): Date {
  const now = new Date();
  const d = parseDateStr(date);
  d.setHours(now.getHours(), now.getMinutes(), 0, 0);
  return d;
}

export function EntrySheet({ record, date, onClose, onDone }: Props) {
  const { categories, homeCategories, byId, payments } = useCatalog();
  const settings = useSettings();
  const editing = record !== null;

  const [amount, setAmount] = useState(record ? String(record.amount) : '');
  const [subLabel, setSubLabel] = useState(record?.subLabel);
  const [memo, setMemo] = useState(record?.memo ?? '');
  const [busy, setBusy] = useState(false);

  /* Defaults are derived, not seeded into state. The catalog and settings
     arrive a frame after mount, and a useState initialiser only ever runs on
     that first frame — freezing the fallbacks there left new records with no
     payment method, which the save guard then rejected. */
  const [pickedCategory, setPickedCategory] = useState<string | null>(record?.categoryId ?? null);
  const [pickedPayment, setPickedPayment] = useState<string | null>(
    record?.paymentMethodId ?? null,
  );

  const categoryId = pickedCategory ?? homeCategories[0]?.id ?? 'etc';
  const paymentId = pickedPayment ?? settings?.defaultPaymentMethodId ?? payments[0]?.id ?? '';

  const category = byId.get(categoryId);

  const pickCategory = (id: string) => {
    setPickedCategory(id);
    // The sub-label belonged to the old category's list, so it stops applying.
    setSubLabel(undefined);
  };

  const submit = async () => {
    if (busy) return;
    if (!amount) {
      onDone('금액부터 입력해줘');
      return;
    }
    if (!paymentId) {
      onDone('결제수단을 먼저 만들어줘');
      return;
    }

    setBusy(true);
    try {
      if (record) {
        await updateExpense(record.id, {
          amount: toMinor(Number(amount)),
          categoryId,
          subLabel,
          // Undefined rather than '' so a cleared memo leaves no empty field
          // behind in the stored row.
          memo: memo.trim() || undefined,
          paymentMethodId: paymentId,
        });
        onDone('수정했어!');
      } else {
        await addExpense({
          amount: Number(amount),
          categoryId,
          subLabel,
          memo,
          paymentMethodId: paymentId,
          at: stampFor(date),
        });
        onDone(`${won(amount)}원 저장했어!`);
      }
      onClose();
    } catch {
      onDone(editing ? '수정하지 못했어' : '저장하지 못했어');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy || !record) return;
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
    <Sheet label={editing ? '기록 수정' : '기록 추가'} onClose={onClose}>
      <div className={styles.head}>
        <span className={styles.title}>{editing ? '기록 수정' : '기록 추가'}</span>
        {editing && (
          <button type="button" className={styles.delete} onClick={remove} disabled={busy}>
            삭제
          </button>
        )}
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

      <input
        className={styles.memo}
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="메모 (선택)"
        enterKeyHint="done"
      />

      <div className={styles.pays}>
        {payments.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPickedPayment(p.id)}
            className={`${styles.pay} ${paymentId === p.id ? styles.payOn : ''}`}
          >
            {p.name}
          </button>
        ))}
      </div>

      <Keypad compact onPress={(k) => setAmount((a) => applyKey(a, k))} />

      <button type="button" className={styles.save} onClick={submit} disabled={busy}>
        {editing ? '수정 완료' : '추가!'}
      </button>
    </Sheet>
  );
}
