import { describe, expect, it } from 'vitest';

import { fmt } from './date';
import { db } from './db';
import { addRecurringRule, deleteRecurringRule, logFromTemplate } from './recurring';
import { bootstrap } from './seed';

async function makeTemplate(over: Partial<Parameters<typeof addRecurringRule>[0]> = {}) {
  await bootstrap();
  await addRecurringRule({
    name: '월세',
    amount: 600000,
    categoryId: 'housing',
    paymentMethodId: 'cash',
    ...over,
  });
  const [rule] = await db.recurringRules.toArray();
  return rule;
}

describe('saved expenses', () => {
  it('stores the amount as given', async () => {
    const rule = await makeTemplate();
    expect(rule.amount).toBe(600_000);
    expect(rule.name).toBe('월세');
  });

  it('carries the whole entry, not just the amount', async () => {
    const rule = await makeTemplate({
      subLabel: '보증금',
      memo: '집주인 계좌',
      paymentMethodId: 'hyundai',
    });

    await logFromTemplate(rule);

    /* The template stores minor units and `addExpense` takes minor units —
       `toMinor` is the identity for KRW. Passing it through a /100 on the way
       out silently logged 6,000원 for a 600,000원 template. */
    const [expense] = await db.expenses.toArray();
    expect(expense.amount).toBe(600_000);
    expect(expense.categoryId).toBe('housing');
    expect(expense.subLabel).toBe('보증금');
    expect(expense.memo).toBe('집주인 계좌');
    expect(expense.paymentMethodId).toBe('hyundai');
  });

  /* The scheduled version needed a unique index so a catch-up pass could not
     write the same occurrence twice. A tap is the user saying it happened,
     and it can happen twice in a day — blocking the second one would be the
     bug, not the guard. */
  it('logs again on a second tap rather than deduplicating', async () => {
    const rule = await makeTemplate({ name: '커피', amount: 4500 });

    await logFromTemplate(rule);
    await logFromTemplate(rule);

    const rows = await db.expenses.toArray();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.amount === 4500)).toBe(true);
  });

  it('files the expense at the moment it is tapped', async () => {
    const rule = await makeTemplate();
    /* `fmt`, not toISOString — the app files by local date, and in KST the two
       disagree for the first nine hours of every day. */
    const today = fmt(new Date());

    await logFromTemplate(rule);

    const [expense] = await db.expenses.toArray();
    expect(expense.date).toBe(today);
  });

  /* What orders the list, now that there is no next-run date to sort by. */
  it('records when a template was last used', async () => {
    const rule = await makeTemplate();
    expect(rule.lastUsedAt).toBeUndefined();

    await logFromTemplate(rule);

    const after = await db.recurringRules.get(rule.id);
    expect(after?.lastUsedAt).toBeTypeOf('number');
  });

  it('leaves already-logged expenses alone when the template is deleted', async () => {
    const rule = await makeTemplate();
    await logFromTemplate(rule);

    await deleteRecurringRule(rule.id);

    expect(await db.recurringRules.count()).toBe(0);
    expect(await db.expenses.count()).toBe(1);
  });
});
