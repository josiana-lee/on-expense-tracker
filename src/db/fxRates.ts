import { isFresh, parseRates, readStoredRates, type FxRates } from '../lib/fxRates';

/** 환율을 받아 오고, 받은 것을 폰에 저장해 두는 곳.
 *
 *  **이 앱이 처음으로 인터넷에 접속하는 곳이다.** 그래서 규칙이 있다:
 *  - 사용자가 외화 칩을 눌렀을 때만 부른다(앱이 혼자 부르지 않는다).
 *  - 받은 지 하루가 안 됐으면 다시 받지 않는다.
 *  - 보내는 건 요청 자체뿐이다 — 가계부 기록도, 어떤 식별값도 싣지 않는다.
 *  - 실패해도 기능은 죽지 않는다. 저장해 둔 환율이나 직접 입력으로 이어진다.
 *
 *  제공처는 이 한 곳이다. 무료 주소라 예고 없이 바뀌거나 끝날 수 있어서, 환율을 받는 코드는
 *  이 파일에만 두었다 — 서비스를 바꿔야 하면 `RATES_URL`과 `parseRates`만 고치면 된다. */
const RATES_URL = 'https://open.er-api.com/v6/latest/USD';
const TIMEOUT_MS = 8_000;

/** 저장 위치는 `localStorage`다. **Dexie(백업되는 곳)에 두지 않은 이유:** 환율은 지워져도 다시 받으면
 *  되는 임시 값인데, 백업 파일에 실리면 복원할 때 "읽지 못한 항목"으로 세어져 사용자에게 알림이 뜬다
 *  (복원은 모르는 `meta` 키를 건너뛴 걸 알린다). */
const STORAGE_KEY = 'on.fxRates';

export function loadCachedRates(): FxRates | null {
  try {
    return readStoredRates(globalThis.localStorage?.getItem(STORAGE_KEY) ?? null);
  } catch {
    return null; // 저장소를 못 읽는 환경(사생활 보호 모드 등)
  }
}

function saveCachedRates(rates: FxRates): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(rates));
  } catch {
    // 못 쓰면 이번 한 번만 쓰고 다음에 다시 받는다. 기능이 죽을 일은 아니다.
  }
}

/** 지금 환율을 인터넷에서 받아 저장한다. 실패하면 던진다(호출하는 쪽이 저장해 둔 환율로 이어간다). */
export async function fetchRates(
  fetchFn: typeof fetch = fetch,
  nowMs: number = Date.now(),
): Promise<FxRates> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(RATES_URL, {
      signal: ctrl.signal,
      // 앱이 어디서 불렀는지도 알리지 않는다.
      referrerPolicy: 'no-referrer',
      credentials: 'omit',
    });
    if (!res.ok) throw new Error(`환율 서버가 ${res.status}로 답했어요`);
    const rates = parseRates(await res.json(), nowMs);
    if (!rates) throw new Error('받은 환율을 읽을 수 없어요');
    saveCachedRates(rates);
    return rates;
  } finally {
    clearTimeout(timer);
  }
}

export type RatesResult = {
  /** 쓸 수 있는 환율. 없으면 null — 직접 입력으로 이어진다. */
  rates: FxRates | null;
  /** 받으려다 실패했다. `rates`가 있으면 묵은 저장본이다. */
  failed: boolean;
};

let inflight: Promise<RatesResult> | null = null;

/** 접속이 실패하면 이만큼은 다시 접속하지 않는다. 서버가 막아 둔 때(429)나 인터넷이 안 될 때 칩을 누를
 *  때마다 다시 두드리면, 막힌 주소를 더 오래 막히게 만들 뿐이다. 그동안은 저장해 둔 환율이나 직접
 *  입력으로 이어진다. */
const RETRY_AFTER_FAIL_MS = 60_000;
let lastFailAt = -Infinity;

/** 쓸 환율을 정한다.
 *
 *  1. 하루 안에 받아 둔 게 있으면 그걸 쓴다(접속하지 않는다).
 *  2. 없거나 묵었고 `allowFetch`면 받는다. 실패하면 묵은 저장본으로 이어간다.
 *  3. `allowFetch`가 아니면 접속하지 않는다 — 있는 대로(묵었어도) 돌려준다.
 *
 *  같은 때에 여러 번 불려도 접속은 한 번이다(칩을 연달아 눌러도 요청이 쌓이지 않는다). */
export function getRates(
  opts: { allowFetch: boolean },
  fetchFn: typeof fetch = fetch,
  nowMs: number = Date.now(),
): Promise<RatesResult> {
  const cached = loadCachedRates();
  if (cached && isFresh(cached, nowMs)) return Promise.resolve({ rates: cached, failed: false });
  if (!opts.allowFetch) return Promise.resolve({ rates: cached, failed: false });
  if (nowMs >= lastFailAt && nowMs - lastFailAt < RETRY_AFTER_FAIL_MS) {
    return Promise.resolve({ rates: cached, failed: true });
  }

  inflight ??= fetchRates(fetchFn, nowMs)
    .then((rates): RatesResult => ({ rates, failed: false }))
    .catch((): RatesResult => {
      lastFailAt = nowMs;
      return { rates: cached, failed: true };
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** 테스트용: 진행 중인 요청과 실패 기억을 지운다. */
export function resetRatesStateForTest(): void {
  inflight = null;
  lastFailAt = -Infinity;
}
