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
    /* 신용카드가 아니면 명세가 없다. 체크카드는 긁는 즉시 계좌에서 빠지므로
       "미결제 잔액"도 "매월 N일 결제"도 존재하지 않는 개념인데, 카드 시트가
       종류와 무관하게 결제 주기를 저장하는 바람에 그 문장이 체크카드 줄에
       그대로 떴다. 저장하는 쪽은 고쳤지만 판정은 여기에도 둔다 — 예전 데이터와
       복원한 백업에는 이미 그런 행이 들어 있고, 화면이 사실이 아닌 말을 하지
       않는 책임은 읽는 쪽에 있다. */
    if (card.kind !== 'credit') return { configured: false };
    if (!startDay || !windows || !card.paymentDay) return { configured: false };
    const cardRows = (rows ?? []).filter((r) => r.paymentMethodId === card.id);
    const billed = sumExpenses(
      cardRows.filter((r) => r.date >= windows.previous.from && r.date <= windows.previous.to),
    );
    const unpaid = sumExpenses(
      cardRows.filter((r) => r.date >= windows.current.from && r.date <= windows.current.to),
    );
    return { configured: true, billed, unpaid, paymentDay: card.paymentDay };
  }, [startDay, windows, card.kind, card.paymentDay, card.id, rows]);
}
