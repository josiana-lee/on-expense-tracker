import { db } from './db';
import { fmt, parseDateStr } from './date';
import { now, uuidv7 } from './id';
import type { DateStr, ID, RecurringRuleRecord } from './types';
import { toMinor } from './types';

export interface RecurringRuleInput {
  name: string;
  amount: number;
  categoryId: ID;
  subLabel?: string;
  paymentMethodId: ID;
  memo?: string;
  interval: RecurringRuleRecord['interval'];
  /** Drives dayOfMonth/weekday/monthOfYear — the user picks one concrete
   *  date and the pattern is derived from it, rather than asking for a
   *  weekday AND a day-of-month AND a start date separately. */
  startDate: DateStr;
  endDate?: DateStr;
  mode: RecurringRuleRecord['mode'];
}

function clampDay(year: number, month0: number, day: number): number {
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  return Math.min(day, daysInMonth);
}

function derivedFields(interval: RecurringRuleRecord['interval'], startDate: DateStr) {
  const d = parseDateStr(startDate);
  return {
    dayOfMonth: interval !== 'weekly' ? d.getDate() : undefined,
    weekday: interval === 'weekly' ? d.getDay() : undefined,
    monthOfYear: interval === 'yearly' ? d.getMonth() + 1 : undefined,
  };
}

/** The next occurrence strictly after `fromDateStr`. Every date this is ever
 *  called with is already on-pattern (either the derived startDate, or a
 *  previous return value of this function), so a fixed step — +7 days, +1
 *  clamped month, +1 clamped year — is always correct; no search needed. */
function advanceOnce(rule: RecurringRuleRecord, fromDateStr: DateStr): DateStr {
  const from = parseDateStr(fromDateStr);

  if (rule.interval === 'weekly') {
    const d = new Date(from);
    d.setDate(d.getDate() + 7);
    return fmt(d);
  }

  if (rule.interval === 'monthly') {
    let year = from.getFullYear();
    let month0 = from.getMonth() + 1;
    if (month0 > 11) {
      month0 = 0;
      year += 1;
    }
    const day = clampDay(year, month0, rule.dayOfMonth ?? 1);
    return fmt(new Date(year, month0, day));
  }

  const year = from.getFullYear() + 1;
  const month0 = (rule.monthOfYear ?? 1) - 1;
  const day = clampDay(year, month0, rule.dayOfMonth ?? 1);
  return fmt(new Date(year, month0, day));
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
    interval: input.interval,
    ...derivedFields(input.interval, input.startDate),
    startDate: input.startDate,
    endDate: input.endDate,
    nextRunDate: input.startDate,
    mode: input.mode,
    active: true,
    createdAt: stamp,
    updatedAt: stamp,
  });
}

/** Editing resets the schedule to the (possibly new) start date rather than
 *  trying to preserve progress through the old one — simplest mental model,
 *  and safe even when the reset start date is in the past: the
 *  &[recurringRuleId+occurrenceDate] unique index makes re-materializing
 *  already-generated occurrences a no-op (see materializeDueRules). */
export async function updateRecurringRule(id: ID, input: RecurringRuleInput): Promise<void> {
  await db.recurringRules.update(id, {
    name: input.name.trim(),
    amount: toMinor(input.amount),
    categoryId: input.categoryId,
    subLabel: input.subLabel,
    paymentMethodId: input.paymentMethodId,
    memo: input.memo?.trim() || undefined,
    interval: input.interval,
    ...derivedFields(input.interval, input.startDate),
    startDate: input.startDate,
    endDate: input.endDate,
    nextRunDate: input.startDate,
    mode: input.mode,
    updatedAt: now(),
  });
}

export async function setRecurringActive(id: ID, active: boolean): Promise<void> {
  await db.recurringRules.update(id, { active, updatedAt: now() });
}

/** Hard delete — only the rule itself. Expenses it already generated keep
 *  their recurringRuleId pointing at a since-deleted rule, which is harmless:
 *  nothing in the app looks that reference back up for display, the same way
 *  a deleted category would if categories were ever hard-deleted (they
 *  aren't, but recurring rules carry no such historical-reference risk since
 *  each generated expense is already a fully independent snapshot). */
export async function deleteRecurringRule(id: ID): Promise<void> {
  await db.recurringRules.delete(id);
}

async function materializeOccurrence(
  rule: RecurringRuleRecord,
  occurrenceDate: DateStr,
): Promise<void> {
  try {
    await db.expenses.add({
      id: uuidv7(),
      date: occurrenceDate,
      time: '09:00',
      amount: rule.amount,
      type: rule.type,
      categoryId: rule.categoryId,
      subLabel: rule.subLabel,
      paymentMethodId: rule.paymentMethodId,
      memo: rule.memo,
      recurringRuleId: rule.id,
      occurrenceDate,
      createdAt: now(),
      updatedAt: now(),
    });
  } catch (e) {
    // Already generated on a previous boot's catch-up — the unique index
    // caught it. Expected, not an error.
    if ((e as Error).name !== 'ConstraintError') throw e;
  }
}

// A weekly rule started years ago could in principle owe thousands of
// occurrences; this caps a single catch-up pass so a pathological rule can't
// hang app boot. Whatever's left over gets picked up on the next boot.
const MAX_CATCHUP_PER_RULE = 366;

/** Runs on every boot (docs/data-model.md §반복 지출). Only mode:'auto' rules
 *  materialize here — mode:'remind' rules are left exactly where they are so
 *  a backlog of missed reminders surfaces in the recurring screen instead of
 *  silently getting logged (or silently skipped) without the user seeing it;
 *  logRecurringOccurrence() is how those advance, one tap at a time. */
export async function materializeDueRules(): Promise<void> {
  const todayStr = fmt(new Date());
  const dueRules = await db.recurringRules.where('nextRunDate').belowOrEqual(todayStr).toArray();

  for (const rule of dueRules) {
    if (!rule.active || rule.mode !== 'auto') continue;

    let cursor = rule.nextRunDate;
    let iterations = 0;
    while (cursor <= todayStr && iterations < MAX_CATCHUP_PER_RULE) {
      if (rule.endDate && cursor > rule.endDate) break;
      await materializeOccurrence(rule, cursor);
      cursor = advanceOnce(rule, cursor);
      iterations++;
    }

    if (cursor === rule.nextRunDate) continue;
    const pastEnd = rule.endDate !== undefined && cursor > rule.endDate;
    await db.recurringRules.update(rule.id, {
      nextRunDate: cursor,
      lastRunDate: todayStr,
      updatedAt: now(),
      ...(pastEnd ? { active: false } : {}),
    });
  }
}

/** "지금 기록하기" — the manual equivalent of materializeDueRules() for a
 *  single mode:'remind' occurrence. Logs the one currently due date and
 *  advances the schedule by exactly one step, so a rule with several missed
 *  occurrences surfaces them one at a time rather than dumping them all at
 *  once. */
export async function logRecurringOccurrence(rule: RecurringRuleRecord): Promise<void> {
  const occurrenceDate = rule.nextRunDate;
  await materializeOccurrence(rule, occurrenceDate);

  const nextRunDate = advanceOnce(rule, occurrenceDate);
  const pastEnd = rule.endDate !== undefined && nextRunDate > rule.endDate;
  await db.recurringRules.update(rule.id, {
    nextRunDate,
    lastRunDate: fmt(new Date()),
    updatedAt: now(),
    ...(pastEnd ? { active: false } : {}),
  });
}
