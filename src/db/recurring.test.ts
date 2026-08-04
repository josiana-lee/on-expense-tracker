import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from './db';
import {
  addRecurringRule,
  logRecurringOccurrence,
  materializeDueRules,
  updateRecurringRule,
} from './recurring';
import { bootstrap } from './seed';

const REMIND = {
  name: '헬스장',
  amount: 50000,
  categoryId: 'food',
  paymentMethodId: 'cash',
  interval: 'monthly' as const,
  startDate: '2026-07-29',
  mode: 'remind' as const,
};

async function onlyRule() {
  return (await db.recurringRules.toArray())[0];
}

describe('recurring rules', () => {
  /* Catch-up runs up to "today", so these assertions are only stable against
     a fixed clock. Only Date is faked — faking timers wholesale would stall
     Dexie, which schedules its own. */
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 4, 12, 0, 0));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('generates one record per month-end, clamped to short months', async () => {
    await bootstrap();
    await addRecurringRule({
      ...REMIND,
      startDate: '2026-01-31',
      mode: 'auto',
    });

    await materializeDueRules();

    const dates = (await db.expenses.toArray()).map((e) => e.date).sort();
    expect(dates).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
      '2026-07-31',
    ]);
  });

  it('does not duplicate occurrences across repeated catch-up passes', async () => {
    await bootstrap();
    await addRecurringRule({ ...REMIND, startDate: '2026-01-31', mode: 'auto' });

    await materializeDueRules();
    const afterFirst = await db.expenses.count();
    await materializeDueRules();
    await materializeDueRules();

    // The &[recurringRuleId+occurrenceDate] unique index is what makes the
    // catch-up loop safe to re-run on every boot.
    expect(await db.expenses.count()).toBe(afterFirst);
  });

  it('leaves remind-mode rules for the user to log', async () => {
    await bootstrap();
    await addRecurringRule(REMIND);

    await materializeDueRules();

    expect(await db.expenses.count()).toBe(0);
    expect((await onlyRule()).nextRunDate).toBe('2026-07-29');
  });

  it('reports whether "지금 기록하기" actually wrote a record', async () => {
    await bootstrap();
    await addRecurringRule(REMIND);

    expect(await logRecurringOccurrence(await onlyRule())).toBe(true);
    expect(await db.expenses.count()).toBe(1);

    // Editing a rule rewinds nextRunDate to its start date, so an occurrence
    // already logged shows up as pending again. Logging it writes nothing.
    await updateRecurringRule((await onlyRule()).id, REMIND);
    const rewound = await onlyRule();
    expect(rewound.nextRunDate).toBe('2026-07-29');

    expect(await logRecurringOccurrence(rewound)).toBe(false);
    expect(await db.expenses.count()).toBe(1);
    // Advancing anyway is what stops the rule getting stuck on that date.
    expect((await onlyRule()).nextRunDate).toBe('2026-08-29');
  });

  it('does not claim a run happened when nothing was written', async () => {
    await bootstrap();
    await addRecurringRule(REMIND);
    await logRecurringOccurrence(await onlyRule());

    await updateRecurringRule((await onlyRule()).id, REMIND);
    await db.recurringRules.update((await onlyRule()).id, { lastRunDate: undefined });

    await logRecurringOccurrence(await onlyRule());

    expect((await onlyRule()).lastRunDate).toBeUndefined();
  });
});
