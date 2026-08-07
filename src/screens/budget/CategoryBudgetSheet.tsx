import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Keypad, applyKey } from '../../components/Keypad';
import { ClearAmount } from '../../components/ClearAmount';
import { Sheet } from '../../components/Sheet';
import { deleteCategoryBudget, setCategoryBudget } from '../../db/budgets';
import type { BudgetRecord, DateStr } from '../../db/types';
import { useCatalog } from '../../hooks/useCatalog';
import { useGuardedAction } from '../../hooks/useGuardedAction';
import { won } from '../../lib/format';
import styles from './CategoryBudgetSheet.module.css';

type Props = {
  periodStart: DateStr;
  periodEnd: DateStr;
  periodLabel: string;
  /** An existing category budget to edit, or null to add one. */
  existing: BudgetRecord | null;
  /** Categories already budgeted this period — excluded from the add picker
   *  so the same category can't get two budget rows for one month. */
  excludeCategoryIds: string[];
  onClose: () => void;
  onDone: (message: string) => void;
};

export function CategoryBudgetSheet({
  periodStart,
  periodEnd,
  periodLabel,
  existing,
  excludeCategoryIds,
  onClose,
  onDone,
}: Props) {
  const editing = existing !== null;
  const { categories, byId } = useCatalog();
  const pickable = categories.filter(
    (c) => c.id === existing?.categoryId || !excludeCategoryIds.includes(c.id),
  );

  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? null);
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '');
  const { busy, guard } = useGuardedAction();

  const category = categoryId ? byId.get(categoryId) : undefined;

  const save = () => {
    if (!categoryId) {
      onDone('카테고리를 먼저 골라줘');
      return;
    }
    if (!amount) {
      onDone('금액을 입력해줘');
      return;
    }
    guard(async () => {
      try {
        await setCategoryBudget(periodStart, periodEnd, categoryId, Number(amount));
        onDone(editing ? '수정했어!' : '카테고리 예산을 추가했어!');
        onClose();
      } catch {
        onDone('저장하지 못했어');
      }
    });
  };

  const remove = () => {
    if (!existing) return;
    guard(async () => {
      try {
        await deleteCategoryBudget(existing.id);
        onDone('삭제했어');
        onClose();
      } catch {
        onDone('삭제하지 못했어');
      }
    });
  };

  return (
    <Sheet label={editing ? '카테고리 예산 수정' : '카테고리 예산 추가'} onClose={onClose}>
      <div className={styles.head}>
        <span className={styles.title}>{editing ? '카테고리 예산 수정' : '카테고리 예산 추가'}</span>
        {editing && (
          <button type="button" className={styles.delete} onClick={remove} disabled={busy}>
            삭제
          </button>
        )}
      </div>
      <div className={styles.sub}>{periodLabel} 기준</div>

      {editing && category ? (
        <div className={styles.editingCat}>
          <span className={styles.editingBadge} style={{ background: category.colorHex }}>
            <Icon path={category.iconPath} size={19} strokeWidth={1.8} />
          </span>
          <span className={styles.editingName}>{category.name}</span>
        </div>
      ) : (
        <div className={styles.cats}>
          {pickable.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryId(c.id)}
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
      )}

      <div className={styles.amountRow}>
        <span className={`${styles.amount} tabular`}>{won(amount || '0')}</span>
        <span className={styles.unit}>원</span>
        {amount && <ClearAmount onClear={() => setAmount('')} />}
      </div>

      <Keypad compact onPress={(k) => setAmount((a) => applyKey(a, k))} />

      <button type="button" className={styles.save} onClick={save} disabled={busy}>
        {editing ? '수정 완료' : '추가!'}
      </button>
    </Sheet>
  );
}
