import { describe, expect, it } from 'vitest';

import { addMonthsClamped } from './date';
import { db } from './db';
import {
  InstallmentRangeError,
  addInstallment,
  deleteInstallmentGroup,
  installmentLabel,
  isInstallment,
  listInstallmentGroup,
  splitInstallment,
} from './installments';
import { bootstrap } from './seed';
import type { ExpenseRecord } from './types';

describe('splitInstallment', () => {
  it('나누어떨어지면 똑같이 쪼갠다', () => {
    expect(splitInstallment(1_200_000, 3)).toEqual([400_000, 400_000, 400_000]);
  });

  /* 이게 이 함수의 존재 이유다. 합이 총액과 1원이라도 다르면 카드 명세서와
     안 맞고, 사용자는 앱을 못 믿게 된다. */
  it('나머지를 첫 회차에 얹어서 합을 총액과 맞춘다', () => {
    const parts = splitInstallment(1_000_000, 3);
    expect(parts).toEqual([333_334, 333_333, 333_333]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1_000_000);
  });

  it('어떤 금액·개월 조합에서도 합이 총액과 같다', () => {
    for (let total = 1; total <= 400; total += 1) {
      for (const months of [2, 3, 4, 5, 6, 9, 12]) {
        if (total < months) continue;
        const parts = splitInstallment(total, months);
        expect(parts).toHaveLength(months);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
        // 0원짜리 회차가 달력에 박히면 사용자 눈에는 고장으로 보인다.
        expect(Math.min(...parts)).toBeGreaterThan(0);
      }
    }
  });

  it('회차가 1원도 못 되게 적은 금액은 거절한다', () => {
    expect(() => splitInstallment(5, 12)).toThrow(InstallmentRangeError);
  });

  it('개월 수 범위를 벗어나면 거절한다', () => {
    expect(() => splitInstallment(100_000, 1)).toThrow(InstallmentRangeError);
    expect(() => splitInstallment(100_000, 13)).toThrow(InstallmentRangeError);
    expect(() => splitInstallment(100_000, 2.5)).toThrow(InstallmentRangeError);
  });
});

describe('addMonthsClamped', () => {
  it('같은 날짜로 한 달씩 민다', () => {
    expect(addMonthsClamped('2026-08-15', 1)).toBe('2026-09-15');
    expect(addMonthsClamped('2026-08-15', 4)).toBe('2026-12-15');
  });

  it('해를 넘긴다', () => {
    expect(addMonthsClamped('2026-11-20', 3)).toBe('2027-02-20');
  });

  /* setMonth에 그냥 맡기면 2/31이 3/3으로 넘어가서 회차가 3월에 겹친다. */
  it('그 달에 없는 날짜는 말일로 당긴다', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-03-31', 1)).toBe('2026-04-30');
  });

  it('윤년 2월은 29일까지 간다', () => {
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
  });

  /* 직전 회차 날짜에서 다시 세면 1/31 → 2/28 → 3/28로 하루씩 잃는다.
     늘 구매일에서 세므로 3월에는 31일이 돌아와야 한다. */
  it('당겨진 회차 다음이 원래 날짜로 돌아온다', () => {
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31');
  });
});

describe('addInstallment', () => {
  it('회차 수만큼 행을 만들고 매월 같은 날짜에 건다', async () => {
    await bootstrap();
    await addInstallment({
      total: 1_200_000,
      months: 3,
      categoryId: 'shopping',
      paymentMethodId: 'cash',
      at: new Date(2026, 7, 15, 14, 30),
    });

    const rows = (await db.expenses.toArray()).sort((a, b) => (a.date < b.date ? -1 : 1));
    expect(rows.map((r) => r.date)).toEqual(['2026-08-15', '2026-09-15', '2026-10-15']);
    expect(rows.map((r) => r.amount)).toEqual([400_000, 400_000, 400_000]);
    expect(rows.every((r) => r.time === '14:30')).toBe(true);
  });

  it('회차가 같은 installmentId를 공유하고 번호를 순서대로 갖는다', async () => {
    await bootstrap();
    const groupId = await addInstallment({
      total: 300_000,
      months: 3,
      categoryId: 'shopping',
      paymentMethodId: 'cash',
      at: new Date(2026, 7, 15),
    });

    const rows = await listInstallmentGroup(groupId);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.installmentNo)).toEqual([1, 2, 3]);
    expect(rows.every((r) => r.installmentMonths === 3)).toBe(true);
    expect(rows.every((r) => r.installmentTotal === 300_000)).toBe(true);
  });

  /* 달력·예산·카드 청구액이 전부 "그 날짜 행의 합"이라, 회차 금액의 총합이
     결제 총액과 같다는 것이 이 기능의 유일한 불변식이다. */
  it('회차 금액의 합이 결제 총액과 같다', async () => {
    await bootstrap();
    // 7은 칩에 없지만 유효한 개월 수다. 나누어떨어지지 않는 쪽을 고른다.
    await addInstallment({
      total: 1_000_000,
      months: 7,
      categoryId: 'shopping',
      paymentMethodId: 'cash',
    });

    const rows = await db.expenses.toArray();
    expect(rows).toHaveLength(7);
    expect(rows.reduce((sum, r) => sum + r.amount, 0)).toBe(1_000_000);
  });

  it('구매일이 월말이면 없는 날짜를 말일로 당긴다', async () => {
    await bootstrap();
    await addInstallment({
      total: 900_000,
      months: 3,
      categoryId: 'shopping',
      paymentMethodId: 'cash',
      at: new Date(2025, 11, 31),
    });

    const dates = (await db.expenses.toArray()).map((r) => r.date).sort();
    expect(dates).toEqual(['2025-12-31', '2026-01-31', '2026-02-28']);
  });

  /* 12/31 시작은 두 방식이 우연히 같은 답을 낸다. 1/31 시작 4개월이라야
     갈린다 — 늘 구매일에서 세면 1/31, 2/28, 3/31, 4/30이지만, 직전 회차에서
     한 달씩 더하면 2/28에 갇혀 3/28, 4/28로 하루씩 잃는다. */
  it('한 번 당겨져도 다음 회차가 원래 날짜로 돌아온다', async () => {
    await bootstrap();
    await addInstallment({
      total: 400_000,
      months: 4,
      categoryId: 'shopping',
      paymentMethodId: 'cash',
      at: new Date(2026, 0, 31),
    });

    const dates = (await db.expenses.toArray()).map((r) => r.date).sort();
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('금액이 너무 적으면 아무 행도 만들지 않는다', async () => {
    await bootstrap();
    await expect(
      addInstallment({ total: 5, months: 12, categoryId: 'shopping', paymentMethodId: 'cash' }),
    ).rejects.toThrow(InstallmentRangeError);
    expect(await db.expenses.count()).toBe(0);
  });

  it('카테고리가 입금이어도 지출로 적는다', async () => {
    await bootstrap();
    await addInstallment({
      total: 200_000,
      months: 2,
      categoryId: 'salary',
      paymentMethodId: 'cash',
    });
    expect((await db.expenses.toArray()).every((r) => r.type === 'expense')).toBe(true);
  });
});

describe('할부 표시', () => {
  it('회차를 사람이 읽는 문구로 만든다', async () => {
    await bootstrap();
    const groupId = await addInstallment({
      total: 300_000,
      months: 3,
      categoryId: 'shopping',
      paymentMethodId: 'cash',
    });
    const rows = await listInstallmentGroup(groupId);
    expect(installmentLabel(rows[1])).toBe('3개월 할부 2/3');
  });

  it('일시불 기록은 할부로 치지 않는다', () => {
    const plain = { id: 'x', amount: 5000 } as unknown as ExpenseRecord;
    expect(isInstallment(plain)).toBe(false);
    expect(installmentLabel(plain)).toBeNull();
  });
});

describe('deleteInstallmentGroup', () => {
  /* 한 회차만 지우면 남은 회차의 합이 총액과 달라지는데, 그 상태를 화면에
     설명할 방법이 없다. 그래서 지우기는 늘 묶음 단위다. */
  it('회차를 전부 지운다', async () => {
    await bootstrap();
    const groupId = await addInstallment({
      total: 600_000,
      months: 6,
      categoryId: 'shopping',
      paymentMethodId: 'cash',
    });

    const removed = await deleteInstallmentGroup(groupId);
    expect(removed).toBe(6);
    expect(await db.expenses.count()).toBe(0);
  });

  it('다른 할부와 일시불 기록은 건드리지 않는다', async () => {
    await bootstrap();
    const keep = await addInstallment({
      total: 200_000,
      months: 2,
      categoryId: 'shopping',
      paymentMethodId: 'cash',
    });
    const drop = await addInstallment({
      total: 300_000,
      months: 3,
      categoryId: 'shopping',
      paymentMethodId: 'cash',
    });

    await deleteInstallmentGroup(drop);
    const left = await db.expenses.toArray();
    expect(left).toHaveLength(2);
    expect(left.every((r) => r.installmentId === keep)).toBe(true);
  });

  it('회차마다 툼스톤을 남긴다', async () => {
    await bootstrap();
    const groupId = await addInstallment({
      total: 300_000,
      months: 3,
      categoryId: 'shopping',
      paymentMethodId: 'cash',
    });
    await deleteInstallmentGroup(groupId);
    expect(await db.tombstones.count()).toBe(3);
  });
});
