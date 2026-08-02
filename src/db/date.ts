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

/** Accounting-month bounds, inclusive. monthStartDay=25 makes "August" run
 *  from Jul 25 to Aug 24. */
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
