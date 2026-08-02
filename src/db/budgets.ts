import { db } from './db';
import { now, uuidv7 } from './id';
import type { BudgetRecord, DateStr } from './types';
import { toMinor } from './types';

/** Only a single whole-month budget is supported for now — no per-category
 *  envelopes yet, so scope/categoryId are always this pair. */
const TOTAL_MONTH_KEY = (periodStart: DateStr) =>
  ['month', 'total', '*', periodStart] as const;

export function getMonthlyBudget(periodStart: DateStr): Promise<BudgetRecord | undefined> {
  return db.budgets
    .where('[period+scope+categoryId+periodStart]')
    .equals(TOTAL_MONTH_KEY(periodStart))
    .first();
}

/** Upserts the total budget for one accounting month. periodEnd is stored
 *  alongside so a later change to monthStartDay can't reinterpret what an
 *  already-set budget's window meant. */
export async function setMonthlyBudget(
  periodStart: DateStr,
  periodEnd: DateStr,
  amountWon: number,
): Promise<void> {
  const amount = toMinor(amountWon);
  const existing = await getMonthlyBudget(periodStart);
  if (existing) {
    await db.budgets.update(existing.id, { amount, periodEnd, updatedAt: now() });
  } else {
    await db.budgets.add({
      id: uuidv7(),
      period: 'month',
      scope: 'total',
      categoryId: '*',
      periodStart,
      periodEnd,
      amount,
      createdAt: now(),
      updatedAt: now(),
    });
  }
}
