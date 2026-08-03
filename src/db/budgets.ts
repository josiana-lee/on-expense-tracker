import { db } from './db';
import { now, uuidv7 } from './id';
import type { BudgetRecord, DateStr, ID } from './types';
import { toMinor } from './types';

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

/** No dedicated index for "all category budgets in a period" — `periodStart`
 *  alone is indexed, and filtering scope in JS after that is cheap at the
 *  handful of rows a person's budgets actually reach. */
export async function getCategoryBudgets(periodStart: DateStr): Promise<BudgetRecord[]> {
  const rows = await db.budgets.where('periodStart').equals(periodStart).toArray();
  return rows.filter((b) => b.scope === 'category');
}

export async function setCategoryBudget(
  periodStart: DateStr,
  periodEnd: DateStr,
  categoryId: ID,
  amountWon: number,
): Promise<void> {
  const amount = toMinor(amountWon);
  const existing = await db.budgets
    .where('[period+scope+categoryId+periodStart]')
    .equals(['month', 'category', categoryId, periodStart])
    .first();
  if (existing) {
    await db.budgets.update(existing.id, { amount, periodEnd, updatedAt: now() });
  } else {
    await db.budgets.add({
      id: uuidv7(),
      period: 'month',
      scope: 'category',
      categoryId,
      periodStart,
      periodEnd,
      amount,
      createdAt: now(),
      updatedAt: now(),
    });
  }
}

/** Plain delete, no tombstone — unlike categories/payment methods, nothing
 *  else stores a reference to a budget's id, so there's no historical
 *  record that could be left pointing at nothing. */
export async function deleteCategoryBudget(id: ID): Promise<void> {
  await db.budgets.delete(id);
}
