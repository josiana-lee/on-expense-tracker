import { describe, expect, it } from 'vitest';

import { CURRENCIES } from './currency';
import { describeAge, FX_TTL_MS, isFresh, parseRates, readStoredRates, type FxRates } from './fxRates';

/** 2026-10-25에 실제로 받은 응답에서 쓰는 값만 옮겼다(달러 기준). */
const RESPONSE = {
  result: 'success',
  base_code: 'USD',
  time_last_update_unix: 1_792_886_551,
  rates: {
    USD: 1,
    KRW: 1324.821047,
    EUR: 0.892628,
    JPY: 156.842558,
    CNY: 6.689203,
    VND: 25817.343746,
    THB: 33.75694,
    GBP: 0.74768,
    TWD: 32.584288,
  },
};

const NOW = 1_792_900_000_000;

describe('parseRates', () => {
  it('달러 기준 응답에서 통화마다 몇 원인지를 구한다', () => {
    const r = parseRates(RESPONSE, NOW)!;
    expect(r.fetchedAt).toBe(NOW);
    expect(r.krwPer.USD).toBeCloseTo(1324.821047, 6);
    expect(r.krwPer.EUR).toBeCloseTo(1324.821047 / 0.892628, 6);
    expect(r.krwPer.JPY).toBeCloseTo(8.4468, 3);
    expect(r.krwPer.VND).toBeCloseTo(0.05131, 4);
  });

  /* 원화 기준으로 받으면 1파운드가 1,773원으로 나왔다(0.000564의 역수). 달러 기준에서 나눈 값이
     실제에 가깝다. 이 비교가 "왜 달러 기준인가"의 증거다. */
  it('원화 기준 응답의 세 자리 값보다 정밀하다', () => {
    const exact = parseRates(RESPONSE, NOW)!.krwPer.GBP;
    const krwBased = 1 / 0.000564;
    expect(exact).toBeCloseTo(1771.9, 1);
    expect(Math.abs(exact - krwBased)).toBeGreaterThan(1);
  });

  it('제공처 갱신 시각을 밀리초로 보관한다', () => {
    expect(parseRates(RESPONSE, NOW)!.asOf).toBe(1_792_886_551_000);
  });

  it('갱신 시각이 없어도 읽는다', () => {
    const { time_last_update_unix: _unused, ...rest } = RESPONSE;
    const r = parseRates(rest, NOW)!;
    expect(r).not.toBeNull();
    expect(r.asOf).toBeUndefined();
  });

  it('여덟 통화가 전부 들어온다', () => {
    const r = parseRates(RESPONSE, NOW)!;
    expect(Object.keys(r.krwPer).sort()).toEqual(CURRENCIES.map((c) => c.code).sort());
  });

  describe('이상한 응답은 통째로 버린다', () => {
    const bad = (patch: (r: typeof RESPONSE) => unknown) =>
      parseRates(patch(structuredClone(RESPONSE)), NOW);

    it('성공이 아닌 응답', () => {
      expect(bad((r) => ({ ...r, result: 'error' }))).toBeNull();
    });

    it('통화가 하나라도 없으면 일부만 쓰지 않는다', () => {
      expect(
        bad((r) => {
          delete (r.rates as Record<string, number>).VND;
          return r;
        }),
      ).toBeNull();
    });

    it('원화가 없는 응답', () => {
      expect(
        bad((r) => {
          delete (r.rates as Record<string, number>).KRW;
          return r;
        }),
      ).toBeNull();
    });

    it('0이거나 음수이거나 숫자가 아닌 값', () => {
      expect(bad((r) => ({ ...r, rates: { ...r.rates, EUR: 0 } }))).toBeNull();
      expect(bad((r) => ({ ...r, rates: { ...r.rates, EUR: -1 } }))).toBeNull();
      expect(bad((r) => ({ ...r, rates: { ...r.rates, EUR: '0.89' } }))).toBeNull();
      expect(bad((r) => ({ ...r, rates: { ...r.rates, EUR: Number.NaN } }))).toBeNull();
    });

    it('원화가 말이 안 되는 범위', () => {
      expect(bad((r) => ({ ...r, rates: { ...r.rates, KRW: 1.3 } }))).toBeNull();
      expect(bad((r) => ({ ...r, rates: { ...r.rates, KRW: 1_000_000 } }))).toBeNull();
    });

    it('객체가 아닌 것', () => {
      expect(parseRates(null, NOW)).toBeNull();
      expect(parseRates('success', NOW)).toBeNull();
      expect(parseRates({ result: 'success' }, NOW)).toBeNull();
      expect(parseRates({ result: 'success', rates: 5 }, NOW)).toBeNull();
    });
  });
});

describe('readStoredRates', () => {
  const good = parseRates(RESPONSE, NOW)!;

  it('저장한 걸 그대로 읽는다', () => {
    expect(readStoredRates(JSON.stringify(good))).toEqual(good);
  });

  it('없거나 깨졌거나 모양이 틀리면 null이다', () => {
    expect(readStoredRates(null)).toBeNull();
    expect(readStoredRates('')).toBeNull();
    expect(readStoredRates('{깨진')).toBeNull();
    expect(readStoredRates('null')).toBeNull();
    expect(readStoredRates('{"fetchedAt":1}')).toBeNull();
    expect(readStoredRates(JSON.stringify({ ...good, krwPer: { ...good.krwPer, EUR: 'x' } }))).toBeNull();
    expect(readStoredRates(JSON.stringify({ ...good, krwPer: { USD: 1 } }))).toBeNull();
  });
});

describe('isFresh', () => {
  const r = { ...parseRates(RESPONSE, NOW)! } satisfies FxRates;

  it('하루 안이면 새것이다', () => {
    expect(isFresh(r, NOW)).toBe(true);
    expect(isFresh(r, NOW + FX_TTL_MS - 1)).toBe(true);
  });

  it('하루가 지나면 묵었다', () => {
    expect(isFresh(r, NOW + FX_TTL_MS)).toBe(false);
  });

  /* 폰 시계가 거꾸로 가면 "받은 지 음수 시간"이 된다. 믿지 말고 새로 받는다. */
  it('받은 시각이 미래이면 믿지 않는다', () => {
    expect(isFresh(r, NOW - 1)).toBe(false);
  });
});

describe('describeAge', () => {
  const r = parseRates(RESPONSE, NOW)!;
  const MIN = 60_000;

  it('시간이 지난 정도를 사람 말로 쓴다', () => {
    expect(describeAge(r, NOW + 20_000)).toBe('방금');
    expect(describeAge(r, NOW + 5 * MIN)).toBe('5분 전');
    expect(describeAge(r, NOW + 3 * 60 * MIN)).toBe('3시간 전');
    expect(describeAge(r, NOW + 2 * 24 * 60 * MIN)).toBe('2일 전');
  });
});
