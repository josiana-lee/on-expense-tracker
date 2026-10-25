/** 해외 결제 환산 — 외화 금액을 치고 원화로 바꾸는 계산.
 *
 *  화면도 네트워크도 모르는 순수한 부분만 여기 둔다. 환율을 받아 오는 일은
 *  `db/fxRates.ts`, 환율 응답을 읽는 일은 `lib/fxRates.ts`다. */

export type CurrencyCode = 'USD' | 'EUR' | 'JPY' | 'CNY' | 'VND' | 'THB' | 'GBP' | 'TWD';

export type Currency = {
  code: CurrencyCode;
  /** 칩에 적는 이름. 한글로 말하는 쪽이 이 앱의 말투다("달러", "엔"). */
  name: string;
  /** 소수 몇 자리까지 치는가. ISO 4217의 보조 단위 자릿수를 따른다 — 엔과 동은 0,
   *  나머지는 2. 카드 명세에 "12.50"처럼 찍히는 통화에 소수점이 없으면 안 된다. */
  decimals: 0 | 2;
  /** 환율을 몇 단위 기준으로 말하는가. 엔과 동은 1단위가 1원보다 한참 작아서("1동 = 0.05원")
   *  은행이 하는 대로 100단위로 말한다("100엔 = 845원"). 계산은 늘 1단위 기준이다. */
  quoteUnit: 1 | 100;
};

/** 칩이 놓이는 순서. 많이 쓸 것부터. */
export const CURRENCIES: readonly Currency[] = [
  { code: 'USD', name: '달러', decimals: 2, quoteUnit: 1 },
  { code: 'EUR', name: '유로', decimals: 2, quoteUnit: 1 },
  { code: 'JPY', name: '엔', decimals: 0, quoteUnit: 100 },
  { code: 'CNY', name: '위안', decimals: 2, quoteUnit: 1 },
  { code: 'VND', name: '동', decimals: 0, quoteUnit: 100 },
  { code: 'THB', name: '바트', decimals: 2, quoteUnit: 1 },
  { code: 'GBP', name: '파운드', decimals: 2, quoteUnit: 1 },
  { code: 'TWD', name: '대만달러', decimals: 2, quoteUnit: 1 },
];

export function currencyOf(code: CurrencyCode): Currency {
  return CURRENCIES.find((c) => c.code === code)!;
}

/** 정수 부분 자릿수의 상한. 원화 쪽 상한(11자리)은 환산한 뒤 화면이 따로 확인한다 —
 *  동은 100억을 쳐도 원화로는 작고, 유로는 반대여서 외화 쪽만 봐서는 정할 수 없다. */
export const MAX_FOREIGN_INT_DIGITS = 11;

/** 외화 금액 글자("12.50")에 키 하나를 적용한다.
 *
 *  금액은 숫자 글자로 들고 있다 — 치다 만 값("12.")이 자기 상태를 가져야 한다.
 *  `decimals`가 0이면 점은 아무 일도 하지 않는다. 소수 자리가 다 찼으면 숫자도
 *  받지 않는다("00"은 들어갈 만큼만 들어간다 — 12.5에 00을 치면 12.50).
 *  정수 부분은 앞의 0을 떼되 "0."으로 시작하는 건 남긴다. */
export function applyForeignKey(text: string, key: string, decimals: number): string {
  if (key === 'del') return text.slice(0, -1);

  if (key === '.') {
    if (decimals === 0 || text.includes('.')) return text;
    return text === '' ? '0.' : `${text}.`;
  }

  if (!/^\d+$/.test(key)) return text;

  const dot = text.indexOf('.');
  if (dot >= 0) {
    const room = decimals - (text.length - dot - 1);
    if (room <= 0) return text;
    return text + key.slice(0, room);
  }

  const int = (text + key).replace(/^0+(?=\d)/, '');
  return int.length > MAX_FOREIGN_INT_DIGITS ? text : int;
}

/** 치고 있는 글자의 값. "12."도 12, 빈 글자는 0. */
export function parseForeign(text: string): number {
  if (text === '' || text === '.') return 0;
  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
}

/** 외화 금액을 원화로. **원 단위로 반올림한다.** 원화에는 보조 단위가 없고, 이 앱은
 *  금액을 정수로만 든다. `krwPerUnit`은 그 통화 1단위가 몇 원인가(엔은 8.4처럼 1보다
 *  작을 수 있다). */
export function foreignToKrw(text: string, krwPerUnit: number): number {
  return Math.round(parseForeign(text) * krwPerUnit);
}

/** 보기 좋게: 정수 부분에 쉼표를 찍고 치고 있는 소수 부분은 그대로 둔다.
 *  "12345.5" → "12,345.5", "12." → "12.", 빈 글자 → "0". */
export function formatForeign(text: string): string {
  if (text === '') return '0';
  const [int, frac] = text.split('.');
  const head = (int || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac === undefined ? head : `${head}.${frac}`;
}

/** 숫자를 읽기 좋게: 소수는 `digits`자리까지 보이되 끝의 0은 뗀다. 쉼표는 정수 부분에만. */
function pretty(n: number, digits: number): string {
  const [int, frac = ''] = n.toFixed(digits).split('.');
  const head = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const tail = frac.replace(/0+$/, '');
  return tail ? `${head}.${tail}` : head;
}

/** 환율을 한 줄로: "1유로 = 1,484.2원", "100엔 = 844.7원". 기준 단위는 통화마다 다르다.
 *  `krwPerUnit`은 1단위가 몇 원인가. */
export function rateLine(code: CurrencyCode, krwPerUnit: number): string {
  const { name, quoteUnit } = currencyOf(code);
  const won = krwPerUnit * quoteUnit;
  return `${quoteUnit}${name} = ${pretty(won, won >= 100 ? 1 : 2)}원`;
}
