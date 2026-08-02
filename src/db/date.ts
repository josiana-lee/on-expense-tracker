import type { DateStr, TimeStr } from './types';

/** Local-calendar 'YYYY-MM-DD'.
 *
 *  Never use toISOString().slice(0,10) here: it converts to UTC first, so in
 *  KST every record made between 00:00 and 09:00 would land on the previous
 *  day. That is the single easiest date bug to ship in this app. */
export function fmt(d: Date): DateStr {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fmtTime(d: Date): TimeStr {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function parseDateStr(s: DateStr): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Accounting-month bounds, inclusive. A cycle is named by the calendar
 *  month it starts in: monthStartDay=25 makes the "2026-08" cycle run
 *  Aug 25 – Sep 24, not Jul 25 – Aug 24. monthStartDay=1 collapses to the
 *  plain calendar month, which is the common case. */
export function monthRange(
  year: number,
  month1to12: number,
  monthStartDay: number,
): { from: DateStr; to: DateStr } {
  const start = new Date(year, month1to12 - 1, monthStartDay);
  const end = new Date(year, month1to12, monthStartDay);
  end.setDate(end.getDate() - 1);
  return { from: fmt(start), to: fmt(end) };
}

/** Which accounting cycle `today` currently falls in, as a (year, 1-12
 *  month) label matching monthRange's naming — i.e. the month the cycle
 *  started in. Before the start day, that's still last month's cycle. */
export function currentAccountingMonth(
  monthStartDay: number,
  today: Date = new Date(),
): { year: number; month: number } {
  let month = today.getMonth() + 1;
  let year = today.getFullYear();
  if (today.getDate() < monthStartDay) {
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return { year, month };
}

/** Splits [from, to] into weekStartDay-aligned chunks. The first and last
 *  chunk are partial whenever the range doesn't start/end exactly on
 *  weekStartDay — an accounting month rarely does. */
export function splitWeeks(
  from: DateStr,
  to: DateStr,
  weekStartDay: number,
): Array<{ from: DateStr; to: DateStr }> {
  const end = parseDateStr(to);
  const weeks: Array<{ from: DateStr; to: DateStr }> = [];
  let cursor = parseDateStr(from);

  while (cursor <= end) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(weekStart);
    // Advance to the day right before the next weekStartDay occurrence.
    while ((weekEnd.getDay() - weekStartDay + 7) % 7 !== 6 && weekEnd < end) {
      weekEnd.setDate(weekEnd.getDate() + 1);
    }
    if (weekEnd > end) weekEnd.setTime(end.getTime());
    weeks.push({ from: fmt(weekStart), to: fmt(weekEnd) });
    cursor = new Date(weekEnd);
    cursor.setDate(cursor.getDate() + 1);
  }

  return weeks;
}

/** Inclusive day count between two DateStr, for prorating a monthly budget
 *  across partial weeks. */
export function daySpan(from: DateStr, to: DateStr): number {
  const ms = parseDateStr(to).getTime() - parseDateStr(from).getTime();
  return Math.round(ms / 86_400_000) + 1;
}
