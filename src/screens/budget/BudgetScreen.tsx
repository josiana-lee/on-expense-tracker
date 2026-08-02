import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Icon } from '../../components/Icon';
import { Toast } from '../../components/Toast';
import { currentAccountingMonth, daySpan, fmt, monthRange, parseDateStr, splitWeeks } from '../../db/date';
import { loadRange, sumExpenses } from '../../db/expenses';
import { useMonthlyBudget } from '../../hooks/useBudget';
import { useSettings } from '../../hooks/useSettings';
import { useToast } from '../../hooks/useToast';
import { shortDate, won } from '../../lib/format';
import { BudgetSheet } from './BudgetSheet';
import styles from './BudgetScreen.module.css';

const WARN_ICON = 'M12 4v10M12 19h.01';

export function BudgetScreen() {
  const settings = useSettings();
  const monthStartDay = settings?.monthStartDay ?? 1;
  const weekStartDay = settings?.weekStartDay ?? 0;
  const { text: toast, flash } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);

  const today = useMemo(() => new Date(), []);
  const { year, month } = currentAccountingMonth(monthStartDay, today);
  const { from, to } = monthRange(year, month, monthStartDay);

  const rows = useLiveQuery(() => loadRange(from, to), [from, to]);
  const monthTotal = useMemo(() => (rows ? sumExpenses(rows) : 0), [rows]);
  const budget = useMonthlyBudget(from);

  const periodLabel =
    monthStartDay === 1
      ? `${month}월`
      : `${shortDate(parseDateStr(from))}~${shortDate(parseDateStr(to))}`;

  const remaining = budget ? budget.amount - monthTotal : 0;
  const over = budget ? monthTotal > budget.amount : false;
  const pct = budget && budget.amount > 0 ? Math.round((monthTotal / budget.amount) * 100) : 0;

  const totalDays = daySpan(from, to);
  const daysLeft = Math.max(1, daySpan(fmt(today), to));
  const dailyLeft = budget ? Math.max(0, Math.floor((budget.amount - monthTotal) / daysLeft)) : 0;

  const weeks = useMemo(() => splitWeeks(from, to, weekStartDay), [from, to, weekStartDay]);
  const weekData = useMemo(
    () =>
      weeks.map((w, i) => {
        const spend = rows
          ? sumExpenses(rows.filter((r) => r.date >= w.from && r.date <= w.to))
          : 0;
        const target = budget
          ? Math.round((budget.amount * daySpan(w.from, w.to)) / totalDays)
          : null;
        return { ...w, index: i + 1, spend, target };
      }),
    [weeks, rows, budget, totalDays],
  );

  return (
    <div className={styles.screen}>
      <div className={styles.head}>
        <div className={styles.titleWrap}>
          <div className={styles.title}>예산</div>
          <div className={styles.period}>{periodLabel}</div>
        </div>
        <button type="button" className={styles.editBtn} onClick={() => setSheetOpen(true)}>
          {budget ? '예산 수정' : '예산 설정'}
        </button>
      </div>

      {budget ? (
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardLabel}>{periodLabel} 예산</span>
            <span className={styles.cardLabel}>{won(budget.amount)}원</span>
          </div>
          <div className={styles.remainRow}>
            <span className={`${styles.remainValue} ${over ? styles.remainValueOver : ''} tabular`}>
              {won(Math.abs(remaining))}
            </span>
            <span className={styles.remainUnit}>{over ? '원 초과했어' : '원 남았어'}</span>
          </div>
          <div className={styles.bar}>
            <div
              className={`${styles.barFill} ${over ? styles.barFillOver : ''}`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <div className={styles.statsRow}>
            <span>
              {won(monthTotal)}원 씀 ({pct}%)
            </span>
            <span>하루 {won(dailyLeft)}원 쓸 수 있어</span>
          </div>
        </div>
      ) : (
        <div className={styles.card}>
          <div className={styles.empty}>
            <p className={styles.emptyText}>
              이번 달 예산을 정해두면 얼마나 남았는지, 하루에 얼마 쓸 수 있는지 보여줄게.
            </p>
            <button type="button" className={styles.emptyCta} onClick={() => setSheetOpen(true)}>
              예산 설정하기
            </button>
          </div>
        </div>
      )}

      {budget && over && (
        <div className={styles.warnCard}>
          <span className={styles.warnIcon}>
            <Icon path={WARN_ICON} size={19} stroke="var(--warn)" strokeWidth={2.2} />
          </span>
          <span className={styles.warnText}>
            이번 달 예산을 {won(monthTotal - budget.amount)}원 넘었어. 남은 기간엔 조금 아껴보자.
          </span>
        </div>
      )}

      <div className={styles.weekCard}>
        {weekData.map((w) => {
          const weekOver = w.target !== null && w.spend > w.target;
          const weekPct = w.target ? Math.min(100, Math.round((w.spend / w.target) * 100)) : 0;
          return (
            <div key={w.from} className={styles.weekRow}>
              <div className={styles.weekTop}>
                <span className={styles.weekName}>
                  {w.index}주차 ({shortDate(parseDateStr(w.from))}~{shortDate(parseDateStr(w.to))})
                </span>
                <span className={`${styles.weekAmt} ${weekOver ? styles.weekAmtOver : ''} tabular`}>
                  {won(w.spend)}원
                </span>
              </div>
              {w.target !== null && (
                <>
                  <div className={styles.weekBar}>
                    <div
                      className={`${styles.weekBarFill} ${weekOver ? styles.weekBarFillOver : ''}`}
                      style={{ width: `${weekPct}%` }}
                    />
                  </div>
                  <div className={styles.weekNote}>
                    주간 목표 {won(w.target)}원
                    {weekOver ? ` · ${won(w.spend - w.target)}원 초과` : ''}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.spacer} />

      {sheetOpen && (
        <BudgetSheet
          periodStart={from}
          periodEnd={to}
          periodLabel={periodLabel}
          current={budget?.amount}
          onClose={() => setSheetOpen(false)}
          onDone={flash}
        />
      )}

      {toast && <Toast text={toast} />}
    </div>
  );
}
