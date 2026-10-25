import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_AMOUNT_DIGITS } from '../../components/Keypad';
import { getRates, type RatesResult } from '../../db/fxRates';
import { updateSettings } from '../../db/settings';
import type { CurrencyCode } from '../../lib/currency';
import {
  amountFor,
  effectiveKrwPer,
  INITIAL_ENTRY,
  stepEntry,
  type EntryAction,
  type ForeignEntry,
} from '../../lib/foreignEntry';
import { isFresh } from '../../lib/fxRates';

/** 환율 줄이 어떤 모습인가.
 *  - `krw`: 원화를 고른 평소 상태. 줄이 없다.
 *  - `ask`: 인터넷으로 환율을 받아도 되는지 아직 안 물어봤다.
 *  - `loading`: 받는 중.
 *  - `ready` / `stale`: 환율이 있다(묵었으면 stale — 묵었음을 보여준다).
 *  - `norate`: 환율이 없다(허락하지 않았거나 받기에 실패했다). 직접 입력으로 이어진다.
 *  - `editing`: 환율을 직접 고치는 중 — 키패드가 환율을 고친다. */
export type RateStatus = 'krw' | 'ask' | 'loading' | 'ready' | 'stale' | 'norate' | 'editing';

type Params = {
  /** 금액 시트가 열려 있는가. 닫히면 입력 상태를 비운다. */
  open: boolean;
  /** 설정의 환율 자동 조회: true 허용, false 직접 입력만, undefined 아직 안 물어봄. */
  fxLookup: boolean | undefined;
  /** 환산한 원화 금액 글자를 바깥 금액 카드에 넣는다. */
  onAmount: (amount: string) => void;
};

/** 금액 시트의 외화 입력. 규칙은 `lib/foreignEntry`에 있고, 여기는 그 규칙에 환율(인터넷)과
 *  설정(허락 여부)을 이어 붙인다.
 *
 *  **인터넷은 사용자가 외화 칩을 눌렀을 때만 쓴다.** 시트를 열거나 앱을 켤 때는 환율을 받지
 *  않는다. 허락도 받은 적 없는데 접속하는 일이 없게, 허락(`fxLookup`)이 true일 때만 받는다. */
export function useForeignEntry({ open, fxLookup, onAmount }: Params) {
  const [entry, setEntryState] = useState<ForeignEntry>(INITIAL_ENTRY);
  const entryRef = useRef(entry);
  const [rates, setRates] = useState<RatesResult | null>(null);
  const [loading, setLoading] = useState(false);
  /** 통화 칩 줄을 펼쳤는가. 평소에는 "해외 결제 금액 입력" 버튼 하나만 보이고, 그걸 눌러야
   *  `원 · 달러 · …` 칩이 나온다 — 외화를 쓰는 일은 드물어서 시트의 기본 모습을 차지하면 안 된다. */
  const [expanded, setExpanded] = useState(false);

  const setEntry = (next: ForeignEntry) => {
    entryRef.current = next;
    setEntryState(next);
  };

  const code = entry.code;
  const autoKrwPer = code && rates?.rates ? rates.rates.krwPer[code] : null;
  const krwPer = effectiveKrwPer(entry, autoKrwPer);

  /* 키를 연달아 눌러도 이전 입력 위에 쌓이게, 최신 환율은 ref로 읽는다. */
  const autoRef = useRef(autoKrwPer);
  autoRef.current = autoKrwPer;
  const onAmountRef = useRef(onAmount);
  onAmountRef.current = onAmount;

  const act = useCallback((action: EntryAction) => {
    const r = stepEntry(entryRef.current, action, {
      autoKrwPer: autoRef.current,
      maxKrwDigits: MAX_AMOUNT_DIGITS,
    });
    setEntry(r.state);
    if (r.amount !== undefined) onAmountRef.current(r.amount);
  }, []);

  // 시트를 닫으면 원화로 돌아가고 칩 줄도 접는다. 바깥 금액은 이미 환산된 값으로 들어가 있다.
  useEffect(() => {
    if (!open) {
      setEntry(INITIAL_ENTRY);
      setExpanded(false);
    }
  }, [open]);

  // 외화 칩을 고르면 환율을 정한다. 허락이 있을 때만 접속하고, 아니면 저장해 둔 것만 본다.
  useEffect(() => {
    if (!open || !code) {
      setLoading(false);
      return;
    }
    let alive = true;
    const allow = fxLookup === true;
    setLoading(allow);
    void getRates({ allowFetch: allow }).then((r) => {
      if (!alive) return;
      setRates(r);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [open, code, fxLookup]);

  // 환율이 뒤늦게 도착하면, 이미 쳐 둔 외화 금액을 그 환율로 환산해서 넣는다.
  useEffect(() => {
    const e = entryRef.current;
    if (!e.code || e.text === '' || autoKrwPer === null) return;
    const r = amountFor(e.text, effectiveKrwPer(e, autoKrwPer), MAX_AMOUNT_DIGITS);
    if (r.kind === 'amount') onAmountRef.current(r.amount);
    // 환율이 바뀔 때만 다시 환산한다. 입력 중에는 stepEntry가 이미 환산한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoKrwPer]);

  const status: RateStatus = (() => {
    if (!code) return 'krw';
    if (entry.editing === 'rate') return 'editing';
    if (entry.rateText !== null && krwPer !== null) return 'ready'; // 직접 고친 환율
    if (loading) return 'loading';
    if (autoKrwPer !== null && rates?.rates) return isFresh(rates.rates, Date.now()) ? 'ready' : 'stale';
    if (fxLookup === undefined) return 'ask';
    return 'norate';
  })();

  return {
    entry,
    status,
    krwPer,
    /** 받아 온 환율(직접 고친 게 있어도 이건 받은 값). 묵은 정도를 말할 때 쓴다. */
    fetched: rates?.rates ?? null,
    /** 환율 서비스에 접속하려다 실패했다. */
    failed: rates?.failed ?? false,
    active: code !== null,
    /** 칩 줄이 펼쳐져 있다. 외화를 고른 동안은 늘 펼쳐져 있다. */
    expanded: expanded || code !== null,
    expand: () => setExpanded(true),
    pickCurrency: (c: CurrencyCode | null) => {
      // "원"을 누르면 평소로 돌아온다 — 칩 줄도 접는다.
      if (c === null) setExpanded(false);
      act({ type: 'currency', code: c });
    },
    press: (key: string) => act({ type: 'key', key }),
    clear: () => act({ type: 'clear' }),
    editRate: () => act({ type: 'editRate' }),
    doneRate: () => act({ type: 'doneRate' }),
    /** 처음 물었을 때의 답. 허락하면 곧바로 받고, 거절하면 직접 입력으로 넘어간다. */
    allow: () => void updateSettings({ fxLookup: true }),
    deny: () => {
      void updateSettings({ fxLookup: false });
      act({ type: 'editRate' });
    },
  };
}
