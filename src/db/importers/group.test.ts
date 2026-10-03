import { describe, expect, it } from 'vitest';

import { groupInstallments } from './group';
import type { ImportRow } from './types';

const row = (date: string, no: number, months: number, key = 'A', amount = 1000): ImportRow => ({
  date: date as ImportRow['date'],
  amount,
  type: 'expense',
  categoryName: '식비',
  paymentName: '삼성카드',
  paymentKind: 'credit',
  installment: { groupKey: key, no, months },
});

const plain = (date: string): ImportRow => ({
  date: date as ImportRow['date'],
  amount: 1000,
  type: 'expense',
  categoryName: '식비',
  paymentName: '현금',
  paymentKind: 'cash',
});

describe('groupInstallments', () => {
  it('1..m이 다 모이면 한 묶음으로 만든다', () => {
    const out = groupInstallments([row('2026-01-01', 1, 3), row('2026-02-01', 2, 3), row('2026-03-01', 3, 3)]);
    const ids = out.map((r) => r.installmentId);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBeDefined();
    expect(out.map((r) => r.installmentNo)).toEqual([1, 2, 3]);
    expect(out.every((r) => r.installmentMonths === 3)).toBe(true);
  });

  /* 총액은 회차 합이다. 다시 나누지 않는다 — 원본 앱이 이미 나눈 값이고,
     우리가 splitInstallment로 다시 쪼개면 나머지 처리 방식이 달라서 1원씩
     어긋날 수 있다. 그러면 카드 명세와 안 맞는다. */
  it('총액은 회차 금액의 합이다', () => {
    const out = groupInstallments([
      row('2026-01-01', 1, 3, 'A', 33334),
      row('2026-02-01', 2, 3, 'A', 33333),
      row('2026-03-01', 3, 3, 'A', 33333),
    ]);
    expect(out.every((r) => r.installmentTotal === 100000)).toBe(true);
  });

  /* 회차가 비면 묶지 않는다. 반쪽 할부는 달력에 "3개월 할부 1/3"과 "3/3"만
     남아서 사용자가 읽을 수 없다. 개별 지출로 두면 적어도 합계는 맞는다. */
  it('회차가 비면 묶지 않고 개별 지출로 둔다', () => {
    const out = groupInstallments([row('2026-01-01', 1, 3), row('2026-03-01', 3, 3)]);
    expect(out.every((r) => r.installmentId === undefined)).toBe(true);
  });

  /* 같은 이름·같은 카드로 2개월 할부를 두 번 하면 1,1,2,2가 한 키에 들어온다.
     날짜 순으로 보며 회차 1을 만날 때마다 새 묶음을 시작하면 갈린다 —
     실제 파일에서 이 처리로 복원율이 96%에서 98.3%로 올랐다. */
  it('같은 키에 묶음이 둘이면 회차 1에서 끊는다', () => {
    const out = groupInstallments([
      row('2026-01-01', 1, 2),
      row('2026-02-01', 2, 2),
      row('2026-06-01', 1, 2),
      row('2026-07-01', 2, 2),
    ]);
    const ids = out.map((r) => r.installmentId);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).toBe(ids[3]);
    expect(ids[0]).not.toBe(ids[2]);
  });

  it('키가 다르면 섞이지 않는다', () => {
    const out = groupInstallments([
      row('2026-01-01', 1, 2, 'A'),
      row('2026-01-01', 1, 2, 'B'),
      row('2026-02-01', 2, 2, 'A'),
      row('2026-02-01', 2, 2, 'B'),
    ]);
    expect(new Set(out.map((r) => r.installmentId)).size).toBe(2);
  });

  it('할부가 아닌 행은 그대로 둔다', () => {
    const out = groupInstallments([plain('2026-01-01'), row('2026-01-01', 1, 1)]);
    expect(out[0].installmentId).toBeUndefined();
  });

  /* 1개월짜리는 할부가 아니다. splitInstallment도 2개월부터만 받는다. */
  it('1개월은 할부로 치지 않는다', () => {
    const out = groupInstallments([row('2026-01-01', 1, 1)]);
    expect(out[0].installmentId).toBeUndefined();
  });

  it('행 개수와 순서는 그대로다', () => {
    const input = [plain('2026-01-02'), row('2026-01-01', 1, 2), row('2026-02-01', 2, 2)];
    const out = groupInstallments(input);
    expect(out).toHaveLength(3);
    expect(out.map((r) => r.date)).toEqual(['2026-01-02', '2026-01-01', '2026-02-01']);
  });
});
