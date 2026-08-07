/** KRW has no minor unit, so amounts are held as plain integers everywhere. */
export function won(n: number | string): string {
  const s = typeof n === 'number' ? String(n) : n;
  return (s || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const DOWS = ['일', '월', '화', '수', '목', '금', '토'];

export function dateText(d: Date): string {
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${DOWS[d.getDay()]}요일`;
}

/** 'M/D', for compact ranges like a budget period or a week's span. */
export function shortDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** Hours are padded so the header clock matches the stored 'HH:mm' shown in
 *  the records list — otherwise 00:30 reads as "0:30" up top and "00:30" below. */
export function timeText(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Which type size an amount needs to stay whole, as a `data-size` value.
 *
 *  Truncating the number is the worst way to run out of room on a screen that
 *  exists to show it: "77,000,..." is not merely hard to read, it is ambiguous
 *  between seventy-seven million and seven hundred seventy million. The type
 *  steps down instead, and only when it has to.
 *
 *  Bucketed by digit count rather than fitted at runtime — the string is a
 *  formatted number in a tabular font, so its width follows from its length
 *  and nothing has to be measured while the user is typing.
 *
 *  Shared by the input card and the calendar's entry sheet so a number that
 *  fits in one cannot overflow the other. Each surface maps these to its own
 *  pixel sizes; only the ordering is common. */
export type AmountSize = 'lg' | 'md' | 'sm' | 'xs' | 'xxs';

export function amountSize(amount: string): AmountSize {
  const n = amount.length;
  if (n <= 6) return 'lg';
  if (n === 7) return 'md';
  if (n === 8) return 'sm';
  if (n === 9) return 'xs';
  return 'xxs';
}
