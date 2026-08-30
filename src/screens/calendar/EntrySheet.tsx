import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Keypad, applyKey } from '../../components/Keypad';
import { ClearAmount } from '../../components/ClearAmount';
import { InstallmentChips } from '../../components/InstallmentChips';
import { InstallmentSheet } from '../../components/InstallmentSheet';
import { Sheet } from '../../components/Sheet';
import { parseDateStr } from '../../db/date';
import { addExpense, deleteExpense, updateExpense } from '../../db/expenses';
import {
  InstallmentRangeError,
  addInstallment,
  deleteInstallmentGroup,
  installmentLabel,
  isInstallment,
  listInstallmentGroup,
} from '../../db/installments';
import type { DateStr, ExpenseRecord } from '../../db/types';
import { toMinor } from '../../db/types';
import { useCatalog } from '../../hooks/useCatalog';
import { useGuardedAction } from '../../hooks/useGuardedAction';
import { useSettings } from '../../hooks/useSettings';
import { amountSize, won } from '../../lib/format';
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

  /* 할부 회차는 혼자 고칠 수 없다. 금액을 하나만 바꾸면 회차 합이 결제
     총액과 어긋나는데, 그 상태를 화면에 설명할 방법이 없다 — 사용자는
     달력에서 숫자가 안 맞는 것만 보게 된다. 그래서 금액은 잠그고, 나머지
     항목은 고치되 묶음 전체에 똑같이 적용한다. 회차마다 카테고리가 다른
     할부는 읽을 수 없다. */
  const installment = record !== null && isInstallment(record);
  const installmentNote = record ? installmentLabel(record) : null;

  const [amount, setAmount] = useState(record ? String(record.amount) : '');
  const [subLabel, setSubLabel] = useState(record?.subLabel);
  const [memo, setMemo] = useState(record?.memo ?? '');
  const { busy, guard } = useGuardedAction();

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

  /* 지난 날짜에 카드값을 뒤늦게 적는 경우가 있다. 입력 탭에만 할부가 있으면
     그 사람은 여기서 총액을 통째로 넣게 되고, 달력과 카드 청구액이 다시
     어긋난다. 수정할 때는 개월 수를 바꿀 수 없다 — 회차 구조를 바꾸는 건
     기존 행을 다시 만드는 일이라, 지우고 새로 넣는 것과 같다. */
  const [months, setMonths] = useState(1);
  const [installOpen, setInstallOpen] = useState(false);
  const canInstall =
    !editing && payments.find((p) => p.id === paymentId)?.kind === 'credit';

  useEffect(() => {
    if (!canInstall && months > 1) setMonths(1);
  }, [canInstall, months]);

  const pickCategory = (id: string) => {
    setPickedCategory(id);
    // The sub-label belonged to the old category's list, so it stops applying.
    setSubLabel(undefined);
  };

  const submit = () => {
    if (!amount) {
      onDone('금액부터 입력해줘');
      return;
    }
    if (!paymentId) {
      onDone('결제수단을 먼저 만들어줘');
      return;
    }

    guard(async () => {
      try {
        if (record && installment) {
          const patch = {
            categoryId,
            subLabel,
            memo: memo.trim() || undefined,
            paymentMethodId: paymentId,
          };
          const rows = await listInstallmentGroup(record.installmentId!);
          for (const r of rows) await updateExpense(r.id, patch);
          onDone(`${rows.length}회차 모두 고쳤어`);
        } else if (record) {
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
        } else if (months > 1) {
          await addInstallment({
            total: Number(amount),
            months,
            categoryId,
            subLabel,
            memo,
            paymentMethodId: paymentId,
            at: stampFor(date),
          });
          onDone(`${months}개월 할부로 저장했어!`);
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
      } catch (e) {
        if (e instanceof InstallmentRangeError) onDone(e.message);
        else onDone(editing ? '수정하지 못했어' : '저장하지 못했어');
      }
    });
  };

  const remove = () => {
    if (!record) return;
    guard(async () => {
      try {
        if (installment) {
          const removed = await deleteInstallmentGroup(record.installmentId!);
          onDone(`${removed}회차 모두 지웠어`);
        } else {
          await deleteExpense(record.id);
          onDone('삭제했어');
        }
        onClose();
      } catch {
        onDone('삭제하지 못했어');
      }
    });
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
        <span className={`${styles.amount} tabular`} data-size={amountSize(amount)}>
          {won(amount || '0')}원
        </span>
        {amount && !installment && <ClearAmount onClear={() => setAmount('')} />}
      </div>

      {installment && (
        <p className={styles.installNote}>
          {installmentNote}
          {record?.installmentTotal !== undefined && ` · 총 ${won(record.installmentTotal)}원`}
          <br />
          금액은 회차별로 고칠 수 없어. 나머지를 고치면 모든 회차에 함께 적용돼.
        </p>
      )}

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

      {/* Appears once a category is picked — the list depends on which one,
          and showing an empty row before that just wastes a beat. */}
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

      {canInstall && (
        <InstallmentChips
          months={months}
          amount={amount}
          onCash={() => setMonths(1)}
          onOpen={() => setInstallOpen(true)}
        />
      )}

      {/* 할부는 금액을 잠그므로 숫자판도 뺀다. 눌러도 저장되지 않는 키패드는
          사용자 눈에 고장으로 보인다. */}
      {!installment && <Keypad compact onPress={(k) => setAmount((a) => applyKey(a, k))} />}

      <button type="button" className={styles.save} onClick={submit} disabled={busy}>
        {editing ? '수정 완료' : '추가!'}
      </button>

      {/* 시트 위의 시트. Sheet는 shell로 포털되고 나중에 마운트된 쪽이 DOM
          순서에서 뒤에 오므로, z-index가 같아도 새 시트가 앞에 선다. 뒤로
          가기도 스택의 맨 위가 가져간다. */}
      {installOpen && (
        <InstallmentSheet
          months={months}
          amount={amount}
          onDone={setMonths}
          onClose={() => setInstallOpen(false)}
        />
      )}
    </Sheet>
  );
}
