import { db, deleteWithTombstone } from './db';
import { fmt, fmtTime } from './date';
import { now, uuidv7 } from './id';
import type { DateStr, ExpenseRecord, ID, Minor, TxType } from './types';
import { toMinor } from './types';

export type NewExpense = {
  amount: number;
  categoryId: ID;
  type?: TxType;
  subLabel?: string;
  paymentMethodId: ID;
  memo?: string;
  /** Defaults to the moment of the call. */
  at?: Date;
};

export async function addExpense(input: NewExpense): Promise<ID> {
  const at = input.at ?? new Date();
  const id = uuidv7();
  const stamp = now();

  await db.expenses.add({
    id,
    date: fmt(at),
    time: fmtTime(at),
    amount: toMinor(input.amount),
    type: input.type ?? 'expense',
    categoryId: input.categoryId,
    subLabel: input.subLabel,
    paymentMethodId: input.paymentMethodId,
    /* 공백만 남은 메모는 없는 것으로 친다. 그냥 넘기면 "  "가 저장돼서
       달력 줄이 "3개월 할부 2/3 ·    · 현대카드"가 되는데, 그 기록을 한 번
       수정하면 사라진다 — 같은 데이터가 들어온 경로에 따라 다르게 남는다. */
    memo: input.memo?.trim() || undefined,
    createdAt: stamp,
    updatedAt: stamp,
  });

  return id;
}

export async function updateExpense(
  id: ID,
  patch: Partial<Omit<ExpenseRecord, 'id' | 'createdAt'>>,
): Promise<void> {
  await db.expenses.update(id, { ...patch, updatedAt: now() });
}

export async function deleteExpense(id: ID): Promise<void> {
  await deleteWithTombstone('expenses', id);
}

export function listByDate(date: DateStr): Promise<ExpenseRecord[]> {
  // Sorted in memory: a single day holds a few dozen rows at most, which is
  // not worth carrying a [date+time] compound index for.
  return db.expenses
    .where('date')
    .equals(date)
    .toArray()
    .then((rows) => rows.sort((a, b) => (a.time < b.time ? 1 : -1)));
}

export function loadRange(from: DateStr, to: DateStr): Promise<ExpenseRecord[]> {
  return db.expenses.where('date').between(from, to, true, true).toArray();
}

/** Every record, newest first. Used for search, which has to scan memo/sub
 *  text across all dates — there's no index for free-text matching, and at
 *  a few thousand rows a year, an in-memory scan is cheap enough not to need
 *  one. */
export function listAllExpenses(): Promise<ExpenseRecord[]> {
  return db.expenses.toArray().then((rows) =>
    rows.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.time < b.time ? 1 : -1;
    }),
  );
}

export type DayTotals = { expense: number; income: number; count: number };

/** Grouped in JS rather than by an index: a month is 200-300 rows, and a
 *  rollup table would put the calendar's numbers at the mercy of every write
 *  path staying in sync. A wrong total is a reason to delete a budgeting app. */
export function groupByDate(rows: ExpenseRecord[]): Map<DateStr, DayTotals> {
  const m = new Map<DateStr, DayTotals>();
  for (const r of rows) {
    let d = m.get(r.date);
    if (!d) {
      d = { expense: 0, income: 0, count: 0 };
      m.set(r.date, d);
    }
    if (r.type === 'income') d.income += r.amount;
    else d.expense += r.amount;
    d.count++;
  }
  return m;
}

export function sumExpenses(rows: ExpenseRecord[]): Minor {
  return rows.reduce((sum, r) => (r.type === 'income' ? sum : sum + r.amount), 0) as Minor;
}
