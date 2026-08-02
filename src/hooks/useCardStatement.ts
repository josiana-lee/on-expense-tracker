import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { currentAccountingMonth, monthRange } from '../db/date';
import { loadRange, sumExpenses } from '../db/expenses';
import type { PaymentMethodRecord } from '../db/types';

export type CardStatement =
  | { configured: false }
  | { configured: true; billed: number; unpaid: number; paymentDay: number };

/** A card's cycle is modelled the same way as the budget's accounting month
 *  (see db/date.ts) — a window starting on statementStartDay each month,
 *  running until the day before the next one starts. The just-closed window
 *  is what gets billed on paymentDay ("이번 달 결제"); the open one is still
 *  accruing ("미결제 잔액"). */
export function useCardStatement(card: PaymentMethodRecord, today: Date): CardStatement {
  const startDay = card.statementStartDay;

  const windows = useMemo(() => {
    if (!startDay) return null;
    const cur = currentAccountingMonth(startDay, today);
    const current = monthRange(cur.year, cur.month, startDay);
    const prevMonth = cur.month === 1 ? 12 : cur.month - 1;
    const prevYear = cur.month === 1 ? cur.year - 1 : cur.year;
    const previous = monthRange(prevYear, prevMonth, startDay);
    return { current, previous };
  }, [startDay, today]);

  const rows = useLiveQuery(
    () => (windows ? loadRange(windows.previous.from, windows.current.to) : Promise.resolve([])),
    [windows?.previous.from, windows?.current.to],
  );

  return useMemo(() => {
    if (!startDay || !windows || !card.paymentDay) return { configured: false };
    const cardRows = (rows ?? []).filter((r) => r.paymentMethodId === card.id);
    const billed = sumExpenses(
      cardRows.filter((r) => r.date >= windows.previous.from && r.date <= windows.previous.to),
    );
    const unpaid = sumExpenses(
      cardRows.filter((r) => r.date >= windows.current.from && r.date <= windows.current.to),
    );
    return { configured: true, billed, unpaid, paymentDay: card.paymentDay };
  }, [startDay, windows, card.paymentDay, card.id, rows]);
}
