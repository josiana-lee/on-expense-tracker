import { describe, expect, it } from 'vitest';

import {
  amountFor,
  effectiveKrwPer,
  INITIAL_ENTRY,
  stepEntry,
  type EntryAction,
  type EntryContext,
  type ForeignEntry,
} from './foreignEntry';

const CTX: EntryContext = { autoKrwPer: 1484.18, maxKrwDigits: 11 };

/** 액션을 차례로 적용하고, 마지막 상태와 "바깥 금액 카드에 마지막으로 들어간 값"을 돌려준다. */
function run(actions: EntryAction[], ctx: EntryContext = CTX, from: ForeignEntry = INITIAL_ENTRY) {
  let state = from;
  let amount: string | undefined;
  for (const a of actions) {
    const r = stepEntry(state, a, ctx);
    state = r.state;
    if (r.amount !== undefined) amount = r.amount;
  }
  return { state, amount };
}

const eur = (keys: string[], ctx = CTX) =>
  run([{ type: 'currency', code: 'EUR' }, ...keys.map((key) => ({ type: 'key' as const, key }))], ctx);

describe('통화를 고르면', () => {
  it('그 통화로 바뀌고 외화 금액은 빈 채로 시작한다', () => {
    const { state, amount } = run([{ type: 'currency', code: 'EUR' }]);
    expect(state).toMatchObject({ code: 'EUR', text: '', rateText: null, editing: 'amount' });
    // 바깥 금액 카드를 건드리지 않는다 — 이미 원화로 5,000원을 쳐 둔 사람이 칩만 눌러도 지워지면 안 된다.
    expect(amount).toBeUndefined();
  });

  /* 통화를 바꾸는 건 대개 잘못 골랐다는 뜻이다. 친 숫자는 두고 새 통화로 다시 환산한다. */
  it('다른 외화로 바꾸면 친 숫자는 두고 환율은 새로 정한다', () => {
    const { state } = run([
      { type: 'currency', code: 'EUR' },
      { type: 'key', key: '1' },
      { type: 'key', key: '2' },
      { type: 'key', key: '.' },
      { type: 'key', key: '5' },
      { type: 'editRate' },
      { type: 'currency', code: 'USD' },
    ]);
    expect(state).toMatchObject({ code: 'USD', text: '12.5', rateText: null, editing: 'amount' });
  });

  it('소수가 없는 통화로 바꾸면 소수 부분을 뗀다', () => {
    const { state } = run([
      { type: 'currency', code: 'EUR' },
      { type: 'key', key: '1' },
      { type: 'key', key: '2' },
      { type: 'key', key: '.' },
      { type: 'key', key: '5' },
      { type: 'currency', code: 'JPY' },
    ]);
    expect(state.text).toBe('12');
  });

  it('원에서 외화로 들어올 때는 빈 채로 시작한다', () => {
    const { state } = run([{ type: 'currency', code: 'EUR' }]);
    expect(state.text).toBe('');
  });

  it('같은 통화를 다시 누르면 아무 일도 없다', () => {
    const { state } = run([
      { type: 'currency', code: 'EUR' },
      { type: 'key', key: '5' },
      { type: 'currency', code: 'EUR' },
    ]);
    expect(state.text).toBe('5');
  });

  it('원으로 돌아가도 바깥 금액은 그대로다', () => {
    const { state, amount } = run([
      { type: 'currency', code: 'EUR' },
      { type: 'key', key: '1' },
      { type: 'key', key: '0' },
      { type: 'currency', code: null },
    ]);
    expect(state.code).toBeNull();
    expect(amount).toBe('14842'); // 10유로 × 1484.18, 돌아가도 이 값이 남는다
  });
});

describe('외화 금액을 치면 원화가 바로 들어간다', () => {
  it('유로 12.50 → 18,552원', () => {
    const { state, amount } = eur(['1', '2', '.', '5', '0']);
    expect(state.text).toBe('12.50');
    expect(amount).toBe('18552');
  });

  it('한 글자씩 칠 때마다 갱신된다', () => {
    const seen: string[] = [];
    let state: ForeignEntry = run([{ type: 'currency', code: 'EUR' }]).state;
    for (const key of ['1', '0', '0']) {
      const r = stepEntry(state, { type: 'key', key }, CTX);
      state = r.state;
      if (r.amount !== undefined) seen.push(r.amount);
    }
    expect(seen).toEqual(['1484', '14842', '148418']);
  });

  it('지워서 비우면 바깥 금액도 빈다', () => {
    const { amount } = eur(['5', 'del']);
    expect(amount).toBe('');
  });

  it('엔은 소수점이 안 눌린다', () => {
    const { state } = run([
      { type: 'currency', code: 'JPY' },
      { type: 'key', key: '1' },
      { type: 'key', key: '.' },
      { type: 'key', key: '5' },
    ], { autoKrwPer: 8.4468, maxKrwDigits: 11 });
    expect(state.text).toBe('15');
  });

  it('엔 1,000 → 8,447원', () => {
    const { amount } = run(
      [{ type: 'currency', code: 'JPY' }, ...['1', '000'].map((key) => ({ type: 'key' as const, key }))],
      { autoKrwPer: 8.4468, maxKrwDigits: 11 },
    );
    expect(amount).toBe('8447');
  });

  it('0.4원짜리는 빈 금액이 된다(0원을 만들지 않는다)', () => {
    const { amount } = run(
      [{ type: 'currency', code: 'VND' }, { type: 'key', key: '5' }],
      { autoKrwPer: 0.0513, maxKrwDigits: 11 },
    );
    expect(amount).toBe('');
  });

  it('원화 상한을 넘게 만드는 키는 받지 않는다', () => {
    // 상한 6자리: 100유로(148,418원)는 들어가고, 한 자리 더 쳐서 1,000유로(1,484,180원, 7자리)가
    // 되는 키는 받지 않는다. 글자도 금액도 100유로 그대로다.
    const ctx = { autoKrwPer: 1484.18, maxKrwDigits: 6 };
    const { state, amount } = eur(['1', '0', '0', '0'], ctx);
    expect(state.text).toBe('100');
    expect(amount).toBe('148418');
  });
});

describe('환율이 없을 때', () => {
  const none: EntryContext = { autoKrwPer: null, maxKrwDigits: 11 };

  it('외화 글자는 받되 원화 금액은 건드리지 않는다', () => {
    const { state, amount } = eur(['5'], none);
    expect(state.text).toBe('5');
    expect(amount).toBeUndefined();
  });

  it('환율을 직접 적으면 그때 환산된다', () => {
    const { state, amount } = run(
      [
        { type: 'currency', code: 'EUR' },
        { type: 'key', key: '1' },
        { type: 'key', key: '0' },
        { type: 'editRate' },
        { type: 'key', key: '1' },
        { type: 'key', key: '5' },
        { type: 'key', key: '0' },
        { type: 'key', key: '0' },
      ],
      none,
    );
    expect(state.rateText).toBe('1500');
    expect(amount).toBe('15000'); // 10유로 × 1,500원
  });
});

describe('환율을 직접 고치기', () => {
  it('받아 온 환율이 처음 칸에 들어 있다', () => {
    const { state } = run([{ type: 'currency', code: 'EUR' }, { type: 'editRate' }]);
    expect(state.editing).toBe('rate');
    expect(state.rateText).toBe('1484.18');
  });

  it('엔은 100엔 기준으로 보여 준다', () => {
    const { state } = run(
      [{ type: 'currency', code: 'JPY' }, { type: 'editRate' }],
      { autoKrwPer: 8.4468, maxKrwDigits: 11 },
    );
    expect(state.rateText).toBe('844.68');
  });

  it('고친 환율로 바로 다시 환산된다', () => {
    const { amount } = run([
      { type: 'currency', code: 'EUR' },
      { type: 'key', key: '1' },
      { type: 'key', key: '0' },
      { type: 'editRate' },
      { type: 'key', key: 'del' },
      { type: 'key', key: 'del' },
      { type: 'key', key: 'del' },
      { type: 'key', key: 'del' },
      { type: 'key', key: 'del' },
      { type: 'key', key: 'del' },
      { type: 'key', key: 'del' },
      { type: 'key', key: '1' },
      { type: 'key', key: '5' },
      { type: 'key', key: '0' },
      { type: 'key', key: '0' },
    ]);
    expect(amount).toBe('15000');
  });

  /* 키패드는 하나다. 환율을 고치는 동안 누르는 숫자가 외화 금액에 들어가면 안 된다. */
  it('환율을 고치는 동안 키는 환율에 들어간다', () => {
    const { state } = run([
      { type: 'currency', code: 'EUR' },
      { type: 'key', key: '7' },
      { type: 'editRate' },
      { type: 'key', key: 'del' },
      { type: 'key', key: '9' },
    ]);
    expect(state.text).toBe('7'); // 외화 금액은 그대로
    expect(state.rateText).toBe('1484.19'); // 환율의 끝 자리가 8 → 9로
  });

  it('끝내면 금액을 다시 고친다', () => {
    const { state } = run([
      { type: 'currency', code: 'EUR' },
      { type: 'editRate' },
      { type: 'doneRate' },
      { type: 'key', key: '3' },
    ]);
    expect(state.editing).toBe('amount');
    expect(state.text).toBe('3');
  });

  it('환율을 다 지우고 끝내면 받아 온 환율로 돌아간다', () => {
    const { state } = run([
      { type: 'currency', code: 'EUR' },
      { type: 'editRate' },
      ...Array.from({ length: 8 }, () => ({ type: 'key' as const, key: 'del' })),
      { type: 'doneRate' },
    ]);
    expect(state.rateText).toBeNull();
  });

  it('환율을 비운 채로는 환산하지 않는다(금액이 0이 되지 않는다)', () => {
    expect(effectiveKrwPer({ ...INITIAL_ENTRY, code: 'EUR', rateText: '' }, 1484)).toBeNull();
  });
});

describe('지우기(×)', () => {
  it('외화 금액과 바깥 금액을 비우고 통화와 고친 환율은 둔다', () => {
    const { state, amount } = run([
      { type: 'currency', code: 'EUR' },
      { type: 'key', key: '5' },
      { type: 'editRate' },
      { type: 'doneRate' },
      { type: 'clear' },
    ]);
    expect(state).toMatchObject({ code: 'EUR', text: '', rateText: '1484.18', editing: 'amount' });
    expect(amount).toBe('');
  });
});

describe('원화일 때', () => {
  it('외화 키는 아무 일도 안 한다', () => {
    const { state, amount } = run([{ type: 'key', key: '5' }]);
    expect(state).toEqual(INITIAL_ENTRY);
    expect(amount).toBeUndefined();
  });

  it('지우기는 처음 상태로 돌린다', () => {
    const { state } = run([{ type: 'currency', code: 'EUR' }, { type: 'key', key: '5' }, { type: 'reset' }]);
    expect(state).toEqual(INITIAL_ENTRY);
  });
});

describe('amountFor', () => {
  it('환율이 없으면 환산하지 않는다', () => {
    expect(amountFor('5', null, 11)).toEqual({ kind: 'norate' });
  });

  it('상한을 넘으면 overflow', () => {
    expect(amountFor('1000', 1484, 6)).toEqual({ kind: 'overflow' });
  });
});
