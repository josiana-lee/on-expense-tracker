import { describe, expect, it } from 'vitest';

import { MAX_AMOUNT, isRealDate, parseWon } from './validate';

/* 가져오기의 값 검증이다. "형식은 맞는데 값이 이상한" 입력이 조용히 들어가서
   합계를 망치거나 달력에서 엉뚱한 날로 밀리는 것을 여기서 막는다. QA가 실제로
   넣어 본 값들이다. */
describe('isRealDate', () => {
  it('달력에 있는 날은 받는다', () => {
    expect(isRealDate('2026-09-11')).toBe(true);
    expect(isRealDate('2028-02-29')).toBe(true); // 윤년
  });

  /* 정규식만 통과하는 날짜. 그대로 저장하면 검색 화면에서 2026-13-45가 "2/14"로,
     2026-02-30이 "3/2"로 밀려 보인다. */
  it('달력에 없는 날은 거른다', () => {
    expect(isRealDate('2026-13-45')).toBe(false);
    expect(isRealDate('2026-02-30')).toBe(false);
    expect(isRealDate('2027-02-29')).toBe(false); // 평년
    expect(isRealDate('2026-00-10')).toBe(false);
  });

  it('형식이 다르면 거른다', () => {
    expect(isRealDate('2026-9-1')).toBe(false);
    expect(isRealDate('2026/09/11')).toBe(false);
    expect(isRealDate('')).toBe(false);
  });

  /* 0000-01-01이나 9999-12-31이 들어오면 미리보기 기간이 "0000-01-01 ~
     9999-12-31"로 보이고 달력 어디에도 안 잡힌다. */
  it('말이 안 되는 연도는 거른다', () => {
    expect(isRealDate('0000-01-01')).toBe(false);
    expect(isRealDate('9999-12-31')).toBe(false);
    expect(isRealDate('1969-12-31')).toBe(false);
  });

  // 위플은 할부를 앞으로 14개월치 미리 적는다. 몇 년 뒤까지는 정상이다.
  it('앞으로의 날짜도 받는다', () => {
    expect(isRealDate('2027-11-01')).toBe(true);
  });
});

describe('parseWon', () => {
  it('쉼표 있는 금액과 없는 금액을 읽는다', () => {
    expect(parseWon('15,400')).toBe(15400);
    expect(parseWon('15400')).toBe(15400);
    expect(parseWon('4,705,814')).toBe(4705814);
  });

  /* Number()는 이 셋을 다 숫자로 읽는다. 15,400.5가 15,401원이 되고, 0x10이
     16원이 되고, 1e3이 1,000원이 되는 건 조용히 틀린 값이 들어가는 것이다. */
  it('소수·16진수·지수 표기는 거른다', () => {
    expect(parseWon('15,400.5')).toBeNull();
    expect(parseWon('0x10')).toBeNull();
    expect(parseWon('1e3')).toBeNull();
  });

  it('0, 음수, 빈 값, 글자는 거른다', () => {
    expect(parseWon('0')).toBeNull();
    expect(parseWon('-100')).toBeNull();
    expect(parseWon('')).toBeNull();
    expect(parseWon('abc')).toBeNull();
    expect(parseWon('15,400원')).toBeNull();
  });

  /* 키패드는 11자리까지만 받는다. 14자리 금액 하나가 들어오면 9월 합계가
     "100,000,000,435,516원"이 되고 달력 칸에는 "1000000억"이 뜬다. */
  it('앱이 받는 최대 금액을 넘으면 거른다', () => {
    expect(parseWon('99,999,999,999')).toBe(MAX_AMOUNT);
    expect(parseWon('100,000,000,000')).toBeNull();
    expect(parseWon('99,999,999,999,999')).toBeNull();
  });
});
