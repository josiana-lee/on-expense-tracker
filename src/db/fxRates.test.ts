import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FX_TTL_MS } from '../lib/fxRates';
import { fetchRates, getRates, loadCachedRates, resetRatesStateForTest } from './fxRates';

const BODY = {
  result: 'success',
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

/** 가짜 네트워크. 호출 횟수를 센다. */
function fakeFetch(impl: () => Promise<Response>) {
  return vi.fn(impl) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}
const ok = () => Promise.resolve(new Response(JSON.stringify(BODY), { status: 200 }));

beforeEach(() => {
  localStorage.clear();
  resetRatesStateForTest();
});

describe('fetchRates', () => {
  it('받아서 저장한다', async () => {
    const f = fakeFetch(ok);
    const r = await fetchRates(f, NOW);
    expect(r.krwPer.USD).toBeCloseTo(1324.821047, 5);
    expect(loadCachedRates()).toEqual(r);
  });

  /* 이 앱이 보내는 건 요청 자체뿐이다. 쿠키·참조 주소 같은 것도 싣지 않는다. */
  it('쿠키와 참조 주소를 싣지 않고 부른다', async () => {
    const f = fakeFetch(ok);
    await fetchRates(f, NOW);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://open.er-api.com/v6/latest/USD');
    expect(init.credentials).toBe('omit');
    expect(init.referrerPolicy).toBe('no-referrer');
  });

  it('서버가 오류로 답하면 던지고 저장하지 않는다', async () => {
    const f = fakeFetch(() => Promise.resolve(new Response('', { status: 429 })));
    await expect(fetchRates(f, NOW)).rejects.toThrow('429');
    expect(loadCachedRates()).toBeNull();
  });

  it('읽을 수 없는 응답이면 던지고 저장하지 않는다', async () => {
    const f = fakeFetch(() => Promise.resolve(new Response(JSON.stringify({ result: 'error' }), { status: 200 })));
    await expect(fetchRates(f, NOW)).rejects.toThrow();
    expect(loadCachedRates()).toBeNull();
  });

  it('JSON이 아니어도 던진다', async () => {
    const f = fakeFetch(() => Promise.resolve(new Response('<html>', { status: 200 })));
    await expect(fetchRates(f, NOW)).rejects.toThrow();
  });
});

describe('getRates', () => {
  it('저장해 둔 게 없고 받아도 되면 받는다', async () => {
    const f = fakeFetch(ok);
    const res = await getRates({ allowFetch: true }, f, NOW);
    expect(f).toHaveBeenCalledTimes(1);
    expect(res.failed).toBe(false);
    expect(res.rates?.krwPer.EUR).toBeCloseTo(1484.18, 1);
  });

  /* 하루 한 번이 약속이다. 저장해 둔 게 새것이면 접속하지 않는다. */
  it('하루 안에 받은 게 있으면 다시 접속하지 않는다', async () => {
    await getRates({ allowFetch: true }, fakeFetch(ok), NOW);
    const f = fakeFetch(ok);
    const res = await getRates({ allowFetch: true }, f, NOW + FX_TTL_MS - 1000);
    expect(f).not.toHaveBeenCalled();
    expect(res.rates).not.toBeNull();
    expect(res.failed).toBe(false);
  });

  it('하루가 지나면 다시 받는다', async () => {
    await getRates({ allowFetch: true }, fakeFetch(ok), NOW);
    const f = fakeFetch(ok);
    await getRates({ allowFetch: true }, f, NOW + FX_TTL_MS + 1000);
    expect(f).toHaveBeenCalledTimes(1);
  });

  /* 사용자가 "직접 입력만 쓸게"를 골랐거나 아직 안 물어본 상태. 접속은 절대 안 한다. */
  it('받아도 된다는 허락이 없으면 접속하지 않는다', async () => {
    const f = fakeFetch(ok);
    const res = await getRates({ allowFetch: false }, f, NOW);
    expect(f).not.toHaveBeenCalled();
    expect(res).toEqual({ rates: null, failed: false });
  });

  it('허락이 없어도 저장해 둔 환율은 묵었어도 돌려준다', async () => {
    await getRates({ allowFetch: true }, fakeFetch(ok), NOW);
    const f = fakeFetch(ok);
    const res = await getRates({ allowFetch: false }, f, NOW + 5 * FX_TTL_MS);
    expect(f).not.toHaveBeenCalled();
    expect(res.rates).not.toBeNull();
  });

  /* 비행기 모드: 못 받으면 마지막 환율로 이어가고, 그게 묵었음은 failed로 알린다. */
  it('받기에 실패하면 묵은 저장본으로 이어간다', async () => {
    await getRates({ allowFetch: true }, fakeFetch(ok), NOW);
    const down = fakeFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const res = await getRates({ allowFetch: true }, down, NOW + 3 * FX_TTL_MS);
    expect(res.failed).toBe(true);
    expect(res.rates).not.toBeNull();
  });

  it('저장본도 없고 실패하면 환율이 없다', async () => {
    const down = fakeFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const res = await getRates({ allowFetch: true }, down, NOW);
    expect(res).toEqual({ rates: null, failed: true });
  });

  /* 칩을 연달아 누르거나 시트를 닫고 바로 여는 경우. 요청이 쌓이면 무료 주소가 막는다. */
  it('동시에 여러 번 불려도 접속은 한 번이다', async () => {
    const f = fakeFetch(ok);
    const [a, b, c] = await Promise.all([
      getRates({ allowFetch: true }, f, NOW),
      getRates({ allowFetch: true }, f, NOW),
      getRates({ allowFetch: true }, f, NOW),
    ]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(a.rates).toEqual(b.rates);
    expect(b.rates).toEqual(c.rates);
  });

  it('실패하고 1분이 지나면 다시 시도할 수 있다', async () => {
    const down = fakeFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    await getRates({ allowFetch: true }, down, NOW);
    const f = fakeFetch(ok);
    const res = await getRates({ allowFetch: true }, f, NOW + 61_000);
    expect(f).toHaveBeenCalledTimes(1);
    expect(res.failed).toBe(false);
  });

  /* 서버가 429로 막았거나 인터넷이 안 될 때 칩을 누를 때마다 다시 두드리면 막힌 주소를 더 오래
     막히게 만든다. */
  it('실패한 직후에는 다시 접속하지 않는다', async () => {
    const down = fakeFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    await getRates({ allowFetch: true }, down, NOW);
    const f = fakeFetch(ok);
    const res = await getRates({ allowFetch: true }, f, NOW + 5_000);
    expect(f).not.toHaveBeenCalled();
    expect(res).toEqual({ rates: null, failed: true });
  });

  it('쉬는 동안에도 저장해 둔 환율은 돌려준다', async () => {
    await getRates({ allowFetch: true }, fakeFetch(ok), NOW);
    const down = fakeFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    await getRates({ allowFetch: true }, down, NOW + 2 * FX_TTL_MS);
    const res = await getRates({ allowFetch: true }, fakeFetch(ok), NOW + 2 * FX_TTL_MS + 5_000);
    expect(res.failed).toBe(true);
    expect(res.rates).not.toBeNull();
  });
});

describe('저장소를 못 쓰는 환경', () => {
  it('읽기가 실패해도 null로 돌아간다', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(loadCachedRates()).toBeNull();
    spy.mockRestore();
  });

  it('쓰기가 실패해도 받은 환율은 이번에 쓴다', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const res = await getRates({ allowFetch: true }, fakeFetch(ok), NOW);
    expect(res.rates).not.toBeNull();
    spy.mockRestore();
  });
});
