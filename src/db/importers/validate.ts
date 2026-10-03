import type { DateStr } from '../types';

/** 앱이 한 건에 받는 최대 금액. 입력 키패드의 11자리 상한(`MAX_AMOUNT_DIGITS`)과
 *  같다 — 손으로는 못 넣는 금액이 가져오기로는 들어오게 두지 않는다. 14자리 금액
 *  하나가 합계 전체를 "100,000,000,435,516원"으로 만든다. */
export const MAX_AMOUNT = 99_999_999_999;

/* 이 범위 밖의 연도는 가계부 기록일 수 없다. 0000-01-01이 들어오면 미리보기 기간이
   "0000-01-01 ~ …"로 보이고 달력 어디에도 안 잡힌다. 위쪽을 2100까지 연 건 위플이
   할부를 앞으로 몇 해치까지 미리 적기 때문이다. */
const MIN_YEAR = 1990;
const MAX_YEAR = 2100;

/** 'YYYY-MM-DD'이면서 달력에 실제로 있는 날인가.
 *
 *  정규식만으로는 2026-13-45와 2026-02-30이 통과한다. 그대로 저장하면 검색
 *  화면에서 "2/14", "3/2"로 밀려 보이고 어느 달 합계에서도 맞지 않는다. Date로
 *  한 바퀴 돌려서 같은 날짜로 돌아오는지 본다 — 없는 날은 다음 달로 넘어가며 달라진다. */
export function isRealDate(s: string): s is DateStr {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < MIN_YEAR || y > MAX_YEAR) return false;
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

/** "15,400" 같은 원 단위 금액을 정수로. 못 읽으면 null.
 *
 *  Number()를 쓰지 않는 이유: 15,400.5가 15,401원이 되고, 0x10이 16원이 되고, 1e3이
 *  1,000원이 된다. 조용히 틀린 값이 들어가는 것이다. 원은 소수 단위가 없으므로
 *  소수가 있으면 다른 통화이거나 깨진 값이고, 어느 쪽이든 넣지 않는다. */
export function parseWon(raw: string): number | null {
  const digits = raw.trim().replace(/,/g, '');
  if (!/^\d+$/.test(digits)) return null;
  const n = Number(digits);
  return n > 0 && n <= MAX_AMOUNT ? n : null;
}
