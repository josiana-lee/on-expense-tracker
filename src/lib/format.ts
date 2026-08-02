/** KRW has no minor unit, so amounts are held as plain integers everywhere. */
export function won(n: number | string): string {
  const s = typeof n === 'number' ? String(n) : n;
  return (s || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const DOWS = ['일', '월', '화', '수', '목', '금', '토'];

export function dateText(d: Date): string {
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${DOWS[d.getDay()]}요일`;
}

export function timeText(d: Date): string {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}
