import {
  applyForeignKey,
  currencyOf,
  foreignToKrw,
  parseForeign,
  type CurrencyCode,
} from './currency';

/** 금액 시트의 외화 입력 한 번의 상태. 화면도 네트워크도 모르고, 키를 누르면 어떻게 되는지만 안다.
 *
 *  원칙은 하나다: **원화 금액(`amount`)은 늘 환산한 결과가 곧바로 들어간다.** 외화를 치는 동안
 *  바깥 금액 카드가 같이 바뀌므로 "완료"를 누를 일도, 시트를 그냥 닫아서 입력이 사라질 일도
 *  없다. 외화는 원화를 만들어 내는 입력 도구일 뿐 기록에 남지 않는다. */
export type ForeignEntry = {
  /** null이면 원화 — 평소 입력이다. */
  code: CurrencyCode | null;
  /** 외화 금액 글자("12.50"). */
  text: string;
  /** 사용자가 직접 고친 환율(`quoteUnit` 기준 원, "844.68"). null이면 받아 온 환율을 쓴다. */
  rateText: string | null;
  /** 키패드가 지금 무엇을 고치는가. */
  editing: 'amount' | 'rate';
};

export const INITIAL_ENTRY: ForeignEntry = { code: null, text: '', rateText: null, editing: 'amount' };

export type EntryAction =
  | { type: 'currency'; code: CurrencyCode | null }
  | { type: 'key'; key: string }
  | { type: 'editRate' }
  | { type: 'doneRate' }
  /** 머리의 지우기(×). 금액만 비우고 고른 통화와 고친 환율은 둔다. */
  | { type: 'clear' }
  | { type: 'reset' };

export type EntryContext = {
  /** 받아 온 환율(그 통화 1단위가 몇 원인가). 없으면 null. */
  autoKrwPer: number | null;
  /** 원화 금액의 자릿수 상한. 넘게 만드는 키는 받지 않는다. */
  maxKrwDigits: number;
};

/** 환율 글자의 소수 자리. "844.68"처럼 둘이면 은행이 말하는 정밀도로 충분하다. */
const RATE_DECIMALS = 2;

/** 지금 쓰는 환율(1단위가 몇 원인가). 직접 고친 게 있으면 그게 먼저다.
 *  고치다가 비운 환율("")은 환율이 없는 것으로 본다 — 0원으로 환산하면 금액이 조용히 0이 된다. */
export function effectiveKrwPer(s: ForeignEntry, autoKrwPer: number | null): number | null {
  if (!s.code) return null;
  if (s.rateText !== null) {
    const n = parseForeign(s.rateText);
    return n > 0 ? n / currencyOf(s.code).quoteUnit : null;
  }
  return autoKrwPer;
}

export type AmountResult =
  | { kind: 'amount'; amount: string }
  | { kind: 'overflow' }
  /** 환율이 없어서 환산할 수 없다. 금액은 건드리지 않는다. */
  | { kind: 'norate' };

/** 외화 글자와 환율에서 원화 금액 글자를 만든다. 0원이면 빈 글자(금액 카드가 "0원"이 아니라 비게). */
export function amountFor(text: string, krwPer: number | null, maxKrwDigits: number): AmountResult {
  if (krwPer === null) return { kind: 'norate' };
  const krw = foreignToKrw(text, krwPer);
  if (krw <= 0) return { kind: 'amount', amount: '' };
  const digits = String(krw);
  return digits.length > maxKrwDigits ? { kind: 'overflow' } : { kind: 'amount', amount: digits };
}

/** 환율 글자로 쓸 값: 소수 둘까지, 끝의 0은 뗀다. */
function rateTextOf(krwPer: number, quoteUnit: number): string {
  return String(Math.round(krwPer * quoteUnit * 100) / 100);
}

export type EntryStep = {
  state: ForeignEntry;
  /** 바깥 금액 카드에 새로 넣을 원화 글자. undefined면 건드리지 않는다. */
  amount?: string;
};

export function stepEntry(s: ForeignEntry, a: EntryAction, ctx: EntryContext): EntryStep {
  switch (a.type) {
    case 'reset':
      return { state: INITIAL_ENTRY };

    case 'clear':
      return { state: { ...s, text: '' }, amount: '' };

    case 'currency': {
      // 같은 칩을 또 누르면 아무 일도 없다.
      if (a.code === s.code) return { state: s };
      // 원으로 돌아가면 외화 상태를 비운다. 바깥 금액 카드는 환산된 값 그대로 남는다.
      if (a.code === null) return { state: INITIAL_ENTRY };
      // 통화를 바꾸는 건 대개 "잘못 골랐다"는 뜻이다. 친 숫자는 그대로 두고 새 통화로 다시 환산한다 —
      // 환율이 통화마다 달라서 직접 고친 환율은 버린다. 엔·동처럼 소수가 없는 통화로 가면 소수 부분을 뗀다.
      // (원에서 외화로 처음 들어올 때는 `text`가 비어 있어서 그대로 빈 채로 시작한다.)
      const text = currencyOf(a.code).decimals === 0 ? s.text.split('.')[0] : s.text;
      return { state: { code: a.code, text, rateText: null, editing: 'amount' } };
    }

    case 'editRate': {
      if (!s.code) return { state: s };
      const unit = currencyOf(s.code).quoteUnit;
      const auto = effectiveKrwPer(s, ctx.autoKrwPer);
      return {
        state: {
          ...s,
          editing: 'rate',
          rateText: s.rateText ?? (auto === null ? '' : rateTextOf(auto, unit)),
        },
      };
    }

    case 'doneRate':
      // 비워 두고 나오면 직접 고친 환율을 버리고 받아 온 환율로 돌아간다.
      return { state: { ...s, editing: 'amount', rateText: s.rateText === '' ? null : s.rateText } };

    case 'key': {
      if (!s.code) return { state: s };

      if (s.editing === 'rate') {
        const rateText = applyForeignKey(s.rateText ?? '', a.key, RATE_DECIMALS);
        const next = { ...s, rateText };
        if (s.text === '') return { state: next };
        const r = amountFor(s.text, effectiveKrwPer(next, ctx.autoKrwPer), ctx.maxKrwDigits);
        if (r.kind === 'overflow') return { state: s };
        return r.kind === 'amount' ? { state: next, amount: r.amount } : { state: next };
      }

      const text = applyForeignKey(s.text, a.key, currencyOf(s.code).decimals);
      if (text === s.text) return { state: s };
      const next = { ...s, text };
      if (text === '') return { state: next, amount: '' };
      const r = amountFor(text, effectiveKrwPer(next, ctx.autoKrwPer), ctx.maxKrwDigits);
      if (r.kind === 'overflow') return { state: s };
      return r.kind === 'amount' ? { state: next, amount: r.amount } : { state: next };
    }
  }
}
