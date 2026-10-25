import { CURRENCIES, type CurrencyCode } from './currency';

/** 오늘의 환율. 폰에 저장해 두고 쓰는 모양이기도 하다. */
export type FxRates = {
  /** 받은 시각(ms). 얼마나 묵었는지는 이걸로 센다. */
  fetchedAt: number;
  /** 제공처가 말하는 갱신 시각(ms). 하루 한 번 바뀌므로 "오늘 환율"이 맞는지는 이쪽이 정직하다. */
  asOf?: number;
  /** 그 통화 1단위가 몇 원인가. */
  krwPer: Record<CurrencyCode, number>;
};

/** 이 시간 안에 받은 환율은 다시 받지 않는다. 제공처가 하루에 한 번만 갱신하므로
 *  더 자주 받아도 같은 값이고, 무료 주소는 자주 부르면 막는다. */
export const FX_TTL_MS = 24 * 60 * 60 * 1000;

/** 원화가 달러에 대해 이 범위를 벗어나면 응답을 믿지 않는다. 오늘 1,300원대이고 몇 년째
 *  1,000~1,600 안쪽이지만 범위는 넉넉히 잡았다 — 틀린 값을 쓰느니 못 쓰는 게 낫지만,
 *  진짜 큰 변동에는 막히지 않아야 한다. */
const KRW_PER_USD_MIN = 300;
const KRW_PER_USD_MAX = 10_000;

const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** 제공처 응답에서 원화 환율을 뽑는다. 이상하면 null.
 *
 *  **달러 기준 응답을 받아 직접 나눈다**("KRW 기준"으로 받지 않는다). 원화 기준으로 받으면
 *  달러·유로 같은 값이 `0.000755`처럼 유효숫자 세 자리로만 와서, 환산하면 0.1% 가까이
 *  틀어진다(1파운드가 1,771.9원인데 1,773원). 달러 기준은 소수 여섯 자리까지 정밀하다.
 *
 *  외부에서 온 값이라 모양을 믿지 않는다. 필요한 통화가 하나라도 없거나 값이 이상하면 일부만
 *  쓰지 않고 통째로 버린다 — 한 통화만 틀린 채로 쓰이는 게 가장 알아채기 어렵다. */
export function parseRates(json: unknown, fetchedAt: number): FxRates | null {
  if (!json || typeof json !== 'object') return null;
  const body = json as Record<string, unknown>;
  if (body.result !== 'success') return null;

  const rates = body.rates;
  if (!rates || typeof rates !== 'object') return null;
  const r = rates as Record<string, unknown>;

  const krw = r.KRW;
  if (!positive(krw) || krw < KRW_PER_USD_MIN || krw > KRW_PER_USD_MAX) return null;

  const krwPer = {} as Record<CurrencyCode, number>;
  for (const { code } of CURRENCIES) {
    // 기준이 달러라서 달러 자신은 1이다. 제공처가 USD를 안 보내도 그건 문제가 아니다.
    const perUsd = code === 'USD' ? 1 : r[code];
    if (!positive(perUsd)) return null;
    krwPer[code] = krw / perUsd;
  }

  const unix = body.time_last_update_unix;
  return {
    fetchedAt,
    ...(positive(unix) ? { asOf: unix * 1000 } : {}),
    krwPer,
  };
}

/** 저장해 둔 글자에서 환율을 읽는다. 저장소는 믿을 수 없다(지워지고, 옛 모양이고, 손으로
 *  고칠 수도 있다) — 모양이 안 맞으면 null이라서 그냥 새로 받는다. */
export function readStoredRates(raw: string | null): FxRates | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<FxRates> | null;
    if (!v || typeof v !== 'object' || !positive(v.fetchedAt) || !v.krwPer) return null;
    const krwPer = {} as Record<CurrencyCode, number>;
    for (const { code } of CURRENCIES) {
      const n = (v.krwPer as Record<string, unknown>)[code];
      if (!positive(n)) return null;
      krwPer[code] = n;
    }
    return { fetchedAt: v.fetchedAt, ...(positive(v.asOf) ? { asOf: v.asOf } : {}), krwPer };
  } catch {
    return null;
  }
}

/** 하루 안에 받은 환율인가. 미래 시각(시계가 바뀐 폰)은 믿지 않고 새로 받게 한다. */
export function isFresh(rates: FxRates, nowMs: number): boolean {
  const age = nowMs - rates.fetchedAt;
  return age >= 0 && age < FX_TTL_MS;
}

/** 얼마나 묵었는지 사람 말로: "방금", "3시간 전", "2일 전". 환율이 묵었음을 숨기지 않으려는 글이다. */
export function describeAge(rates: FxRates, nowMs: number): string {
  const min = Math.floor((nowMs - rates.fetchedAt) / 60_000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}
