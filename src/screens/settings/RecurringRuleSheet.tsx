import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Keypad, applyKey } from '../../components/Keypad';
import { ClearAmount } from '../../components/ClearAmount';
import { Sheet } from '../../components/Sheet';
import type { RecurringRuleInput } from '../../db/recurring';
import {
  addRecurringRule,
  deleteRecurringRule,
  updateRecurringRule,
} from '../../db/recurring';
import type { RecurringRuleRecord } from '../../db/types';
import { useCatalog } from '../../hooks/useCatalog';
import { useGuardedAction } from '../../hooks/useGuardedAction';
import { useSettings } from '../../hooks/useSettings';
import { won } from '../../lib/format';
import styles from './RecurringRuleSheet.module.css';

type Props = {
  /** An existing rule to edit, or null to create one. */
  rule: RecurringRuleRecord | null;
  onClose: () => void;
  onDone: (message: string) => void;
};

export function RecurringRuleSheet({ rule, onClose, onDone }: Props) {
  const { categories, payments } = useCatalog();
  const settings = useSettings();
  const editing = rule !== null;
  const { busy, guard } = useGuardedAction();

  const [name, setName] = useState(rule?.name ?? '');
  const [amount, setAmount] = useState(rule ? String(rule.amount) : '');
  const [pickedCategory, setPickedCategory] = useState<string | null>(rule?.categoryId ?? null);
  const [subLabel, setSubLabel] = useState<string | undefined>(rule?.subLabel);
  const [pickedPayment, setPickedPayment] = useState<string | null>(
    rule?.paymentMethodId ?? null,
  );
  const [memo, setMemo] = useState(rule?.memo ?? '');

  const categoryId = pickedCategory ?? categories[0]?.id ?? '';
  const paymentId = pickedPayment ?? settings?.defaultPaymentMethodId ?? payments[0]?.id ?? '';
  const category = categories.find((c) => c.id === categoryId);

  const pickCategory = (id: string) => {
    setPickedCategory(id);
    setSubLabel(undefined);
  };

  const submit = () => {
    if (!name.trim()) {
      onDone('이름을 입력해줘');
      return;
    }
    if (!amount) {
      onDone('금액을 입력해줘');
      return;
    }
    if (!paymentId) {
      onDone('결제수단을 먼저 만들어줘');
      return;
    }

    guard(async () => {
      try {
        const input: RecurringRuleInput = {
          name,
          amount: Number(amount),
          categoryId,
          subLabel,
          paymentMethodId: paymentId,
          memo,
        };

        if (rule) {
          await updateRecurringRule(rule.id, input);
          onDone('수정했어!');
        } else {
          await addRecurringRule(input);
          onDone('반복 지출을 추가했어!');
        }
        onClose();
      } catch {
        onDone(editing ? '수정하지 못했어' : '추가하지 못했어');
      }
    });
  };

  const remove = () => {
    if (!rule) return;
    guard(async () => {
      try {
        await deleteRecurringRule(rule.id);
        onDone('삭제했어');
        onClose();
      } catch {
        onDone('삭제하지 못했어');
      }
    });
  };


  return (
    <Sheet label={editing ? '반복 지출 수정' : '반복 지출 추가'} onClose={onClose}>
      <div className={styles.head}>
        <span className={styles.title}>{editing ? '반복 지출 수정' : '반복 지출 추가'}</span>
        {editing && (
          <button type="button" className={styles.delete} onClick={remove} disabled={busy}>
            삭제
          </button>
        )}
      </div>

      <input
        className={styles.name}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="이름 (예: 넷플릭스)"
        enterKeyHint="done"
      />


      <div className={styles.amountRow}>
        <span className={`${styles.amount} tabular`}>{won(amount || '0')}</span>
        <span className={styles.unit}>원</span>
        {amount && <ClearAmount onClear={() => setAmount('')} />}
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
          >
            <span className={styles.catCircle} style={{ background: c.colorHex }}>
              <Icon path={c.iconPath} size={20} strokeWidth={1.8} />
            </span>
            <span className={styles.catName}>{c.name}</span>
          </button>
        ))}
      </div>

      {category && category.subs.length > 0 && (
        <div className={styles.subs}>
          {category.subs.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSubLabel((cur) => (cur === s ? undefined : s))}
              className={`${styles.sub} ${subLabel === s ? styles.subOn : ''}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

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
