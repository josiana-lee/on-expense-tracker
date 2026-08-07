import { db } from './db';
import { now, uuidv7 } from './id';
import type { ID, RecurringRuleRecord } from './types';
import { toMinor } from './types';
import { addExpense } from './expenses';

/** Saved expenses you log with one tap.
 *
 *  These used to run on a schedule — pick 매월 and a start date, and the app
 *  wrote the record for you on the day. That was dropped because the schedule
 *  was usually wrong: rent has a due date but gets paid a day or two either
 *  side of it, and an entry auto-filed on the wrong date is worse than no
 *  entry at all, since the user has to go find and correct it. A wrong record
 *  costs more than a missing one.
 *
 *  What is left is the part that was actually saving work: the amount, the
 *  category and the payment method, kept together under a name so logging
 *  them again is one tap instead of a dozen. */
export interface RecurringRuleInput {
  name: string;
  amount: number;
  categoryId: ID;
  subLabel?: string;
  paymentMethodId: ID;
  memo?: string;
}

export async function addRecurringRule(input: RecurringRuleInput): Promise<void> {
  const stamp = now();
  await db.recurringRules.add({
    id: uuidv7(),
    name: input.name.trim(),
    amount: toMinor(input.amount),
    type: 'expense',
    categoryId: input.categoryId,
    subLabel: input.subLabel,
    paymentMethodId: input.paymentMethodId,
    memo: input.memo?.trim() || undefined,
    createdAt: stamp,
    updatedAt: stamp,
  });
}

export async function updateRecurringRule(id: ID, input: RecurringRuleInput): Promise<void> {
  await db.recurringRules.update(id, {
    name: input.name.trim(),
    amount: toMinor(input.amount),
    categoryId: input.categoryId,
    subLabel: input.subLabel,
    paymentMethodId: input.paymentMethodId,
    memo: input.memo?.trim() || undefined,
    updatedAt: now(),
  });
}

/** Hard delete — only the template. Expenses logged from it are already
 *  independent records and keep whatever they were given. */
export async function deleteRecurringRule(id: ID): Promise<void> {
  await db.recurringRules.delete(id);
}

/** Files an expense from a saved template, dated now.
 *
 *  No idempotency guard, deliberately. The scheduled version needed one so a
 *  catch-up pass couldn't write the same occurrence twice, but a tap is the
 *  user saying "this happened" — and it can genuinely happen twice in a day.
 *  Blocking the second coffee would be the bug.
 *
 *  `lastUsedAt` is what orders the list, so the templates someone actually
 *  reaches for drift to the front. */
export async function logFromTemplate(rule: RecurringRuleRecord): Promise<void> {
  await addExpense({
    /* Already minor units, and `toMinor` is the identity for KRW — 원 is the
       smallest unit, there are no cents to divide out. */
    amount: rule.amount,
    categoryId: rule.categoryId,
    subLabel: rule.subLabel,
    paymentMethodId: rule.paymentMethodId,
    memo: rule.memo,
    type: rule.type,
  });

  await db.recurringRules.update(rule.id, { lastUsedAt: now(), updatedAt: now() });
}
