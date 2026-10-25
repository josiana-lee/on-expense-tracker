import { describe, expect, it } from 'vitest';

import {
  applyForeignKey,
  CURRENCIES,
  currencyOf,
  foreignToKrw,
  formatForeign,
  MAX_FOREIGN_INT_DIGITS,
  parseForeign,
  rateLine,
} from './currency';

/** 키를 순서대로 눌러 본다. */
const type = (keys: string[], decimals = 2) =>
  keys.reduce((text, k) => applyForeignKey(text, k, decimals), '');

describe('통화 목록', () => {
  it('여덟 개이고 코드가 겹치지 않는다', () => {
    expect(CURRENCIES).toHaveLength(8);
    expect(new Set(CURRENCIES.map((c) => c.code)).size).toBe(8);
  });

  /* 엔·동은 보조 단위가 없고 나머지는 둘이다. 카드 명세에 "12.50"이 찍히는 통화에서 소수점이
     안 눌리면 입력을 못 한다. */
  it('소수 자리는 엔·동만 0이다', () => {
    expect(CURRENCIES.filter((c) => c.decimals === 0).map((c) => c.code)).toEqual(['JPY', 'VND']);
  });

  it('엔·동만 100단위로 환율을 말한다', () => {
    expect(CURRENCIES.filter((c) => c.quoteUnit === 100).map((c) => c.code)).toEqual(['JPY', 'VND']);
  });
});

describe('applyForeignKey', () => {
  it('숫자를 이어 붙인다', () => {
    expect(type(['1', '2', '5'])).toBe('125');
  });

  it('점을 찍고 소수를 친다', () => {
    expect(type(['1', '2', '.', '5', '0'])).toBe('12.50');
  });

  it('소수 자리가 다 차면 더 받지 않는다', () => {
    expect(type(['1', '.', '2', '5', '9'])).toBe('1.25');
  });

  it('00은 들어갈 만큼만 들어간다', () => {
    expect(type(['1', '2', '.', '5', '00'])).toBe('12.50');
    expect(type(['1', '2', '.', '00'])).toBe('12.00');
    expect(type(['1', '00'])).toBe('100');
  });

  it('점은 한 번만 찍힌다', () => {
    expect(type(['1', '.', '.', '5'])).toBe('1.5');
  });

  it('처음에 점을 치면 0.으로 시작한다', () => {
    expect(type(['.', '5'])).toBe('0.5');
  });

  it('앞의 0은 떼되 0.으로 시작하는 건 남긴다', () => {
    expect(type(['0', '5'])).toBe('5');
    expect(type(['0', '0', '5'])).toBe('5');
    expect(type(['0', '.', '5'])).toBe('0.5');
    expect(type(['0'])).toBe('0');
    expect(type(['00'])).toBe('0');
  });

  /* 엔·동은 소수가 없다. 점이 눌려서 "1000."이 되면 환산은 되지만 글자가 이상하다. */
  it('소수가 없는 통화에서는 점이 아무 일도 안 한다', () => {
    expect(type(['1', '0', '.', '0', '0'], 0)).toBe('1000');
  });

  it('지우면 한 글자씩 빠진다', () => {
    expect(applyForeignKey('12.5', 'del', 2)).toBe('12.');
    expect(applyForeignKey('12.', 'del', 2)).toBe('12');
    expect(applyForeignKey('', 'del', 2)).toBe('');
  });

  it('정수 부분은 상한을 넘기면 더 받지 않는다', () => {
    const full = '9'.repeat(MAX_FOREIGN_INT_DIGITS);
    expect(applyForeignKey(full, '1', 2)).toBe(full);
    expect(applyForeignKey(full, '.', 2)).toBe(`${full}.`);
  });

  it('모르는 키는 무시한다', () => {
    expect(applyForeignKey('12', 'x', 2)).toBe('12');
  });
});

describe('parseForeign', () => {
  it('치다 만 값도 읽는다', () => {
    expect(parseForeign('12.')).toBe(12);
    expect(parseForeign('0.')).toBe(0);
    expect(parseForeign('.')).toBe(0);
    expect(parseForeign('')).toBe(0);
    expect(parseForeign('12.5')).toBe(12.5);
  });
});

describe('foreignToKrw', () => {
  it('외화 금액에 환율을 곱해 원 단위로 반올림한다', () => {
    expect(foreignToKrw('12.50', 1484.18)).toBe(18552); // 18552.25
    expect(foreignToKrw('1', 1324.82)).toBe(1325);
  });

  it('반올림은 가까운 정수로 한다', () => {
    expect(foreignToKrw('1', 1000.4)).toBe(1000);
    expect(foreignToKrw('1', 1000.5)).toBe(1001);
  });

  /* 1엔이 8.4원쯤이라 엔은 1보다 작은 환율이 아니라 곱셈이 작다. 동은 1동이 0.05원이다. */
  it('1원보다 작은 단위(동)도 계산된다', () => {
    expect(foreignToKrw('100000', 0.0513)).toBe(5130);
    expect(foreignToKrw('1', 0.0513)).toBe(0);
  });

  it('빈 글자는 0원이다', () => {
    expect(foreignToKrw('', 1484)).toBe(0);
  });
});

describe('formatForeign', () => {
  it('정수 부분에만 쉼표를 찍는다', () => {
    expect(formatForeign('1234567')).toBe('1,234,567');
    expect(formatForeign('12345.5')).toBe('12,345.5');
    expect(formatForeign('1234.56')).toBe('1,234.56');
  });

  it('치는 중인 점과 소수는 그대로 보여준다', () => {
    expect(formatForeign('12.')).toBe('12.');
    expect(formatForeign('0.0')).toBe('0.0');
  });

  it('빈 글자는 0이다', () => {
    expect(formatForeign('')).toBe('0');
  });
});

describe('rateLine', () => {
  it('1단위로 말하는 통화', () => {
    expect(rateLine('EUR', 1484.18)).toBe('1 EUR = 1,484.2원');
    expect(rateLine('USD', 1324.82)).toBe('1 USD = 1,324.8원');
  });

  it('엔·동은 100단위로 말한다', () => {
    expect(rateLine('JPY', 8.4468)).toBe('100 JPY = 844.7원');
    expect(rateLine('VND', 0.0513)).toBe('100 VND = 5.13원');
  });

  /* 소수 부분에 쉼표가 들어가면("0.0,513") 읽을 수 없다. */
  it('소수 부분에는 쉼표가 들어가지 않는다', () => {
    expect(rateLine('VND', 0.00001)).not.toMatch(/\.\d*,/);
    expect(rateLine('TWD', 40.66)).toBe('1 TWD = 40.66원');
  });

  it('통화 정보를 찾을 수 있다', () => {
    expect(currencyOf('JPY').name).toBe('엔');
  });
});
