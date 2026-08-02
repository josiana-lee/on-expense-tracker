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
