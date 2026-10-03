import { describe, expect, it } from 'vitest';

import { db } from '../db';
import { bootstrap } from '../seed';
import { listInstallmentGroup } from '../installments';
import { parseWeple } from './weple';
import { planImport } from './plan';
import { runImport } from './commit';

const HEAD = '사용자,거래일,수입/지출,금액,분류,하위 분류,내역,지불,카드,메모';
const file = (...lines: string[]) => [HEAD, ...lines].join('\n');

async function plan(text: string) {
  await bootstrap();
  const [categories, payments] = await Promise.all([
    db.categories.toArray(),
    db.paymentMethods.toArray(),
  ]);
  return planImport(parseWeple(text), categories, payments);
}

describe('runImport', () => {
  it('기록을 더한다 — 있던 것을 지우지 않는다', async () => {
    const p = await plan(file('내 가계부,2026-01-01,지출,"9,000",식비,,김밥,현금,현금,'));
    const before = await db.expenses.count();

    const out = await runImport(p, new Map());

    expect(out.added).toBe(1);
    expect(await db.expenses.count()).toBe(before + 1);
  });

  it('고른 대로 카테고리를 붙인다', async () => {
    const p = await plan(file('내 가계부,2026-01-01,지출,"1,000",악세사리,,반지,현금,현금,'));
    await runImport(p, new Map([['악세사리', 'etc']]));
    const row = (await db.expenses.toArray()).at(-1);
    expect(row?.categoryId).toBe('etc');
    expect(row?.subLabel).toBe('반지');
  });

  /* "카드대금" 같은 분류는 지출이 아니라 카드값을 갚은 기록이다. 넣으면 같은
     돈이 두 번 세어지므로 빼는 길이 있어야 한다. */
  it('null을 고른 분류는 건너뛴다', async () => {
    const p = await plan(
      file(
        '내 가계부,2026-01-01,지출,"1,000",카드대금,,갚음,현금,현금,',
        '내 가계부,2026-01-02,지출,"2,000",식비,,김밥,현금,현금,',
      ),
    );
    const out = await runImport(p, new Map([['카드대금', null]]));
    expect(out.added).toBe(1);
    expect(out.skipped).toBe(1);
  });

  it('없는 결제수단을 만들어 붙인다', async () => {
    const p = await plan(file('내 가계부,2026-01-01,지출,"1,000",식비,,가,카드,롯데카드,'));
    const out = await runImport(p, new Map());

    expect(out.createdPayments).toBe(1);
    const made = (await db.paymentMethods.toArray()).find((x) => x.name === '롯데카드');
    expect(made?.kind).toBe('credit');
    expect((await db.expenses.toArray()).at(-1)?.paymentMethodId).toBe(made?.id);
  });

  it('쓰던 결제수단은 다시 만들지 않는다', async () => {
    const p = await plan(file('내 가계부,2026-01-01,지출,"1,000",식비,,가,현금,현금,'));
    const out = await runImport(p, new Map());
    expect(out.createdPayments).toBe(0);
  });

  describe('할부', () => {
    it('회차가 다 모이면 할부로 들어간다', async () => {
      const p = await plan(
        file(
          '내 가계부,2026-01-01,지출,"100,000",식비,,노트북(1/3),카드,삼성카드,',
          '내 가계부,2026-02-01,지출,"100,000",식비,,노트북(2/3),카드,삼성카드,',
          '내 가계부,2026-03-01,지출,"100,000",식비,,노트북(3/3),카드,삼성카드,',
        ),
      );
      await runImport(p, new Map());

      const saved = (await db.expenses.toArray()).filter((r) => r.installmentId);
      expect(saved).toHaveLength(3);
      const group = await listInstallmentGroup(saved[0].installmentId!);
      expect(group.map((r) => r.installmentNo)).toEqual([1, 2, 3]);
      expect(group.every((r) => r.installmentMonths === 3)).toBe(true);
      // 총액은 회차 합. 다시 나누지 않는다.
      expect(group.every((r) => r.installmentTotal === 300000)).toBe(true);
      expect(group.reduce((s, r) => s + r.amount, 0)).toBe(300000);
      // 이름에서 회차 표기는 떨어져 있다.
      expect(group[0].subLabel).toBe('노트북');
    });

    it('회차가 비면 할부가 아니라 일반 지출로 들어간다', async () => {
      const p = await plan(
        file(
          '내 가계부,2026-01-01,지출,"100,000",식비,,가방(1/3),카드,삼성카드,',
          '내 가계부,2026-03-01,지출,"100,000",식비,,가방(3/3),카드,삼성카드,',
        ),
      );
      await runImport(p, new Map());
      const saved = (await db.expenses.toArray()).filter((r) => r.subLabel === '가방');
      expect(saved).toHaveLength(2);
      expect(saved.every((r) => r.installmentId === undefined)).toBe(true);
    });
  });

  it('수입은 수입으로 들어간다', async () => {
    const p = await plan(file('내 가계부,2026-01-01,수입,"500,000",식비,,보너스,현금,현금,'));
    await runImport(p, new Map());
    expect((await db.expenses.toArray()).at(-1)?.type).toBe('income');
  });

  it('진행 상황을 알려준다', async () => {
    const lines = Array.from(
      { length: 5 },
      (_, i) => `내 가계부,2026-01-0${i + 1},지출,"1,000",식비,,가${i},현금,현금,`,
    );
    const p = await plan(file(...lines));
    const seen: number[] = [];
    await runImport(p, new Map(), (done, total) => {
      expect(total).toBe(5);
      seen.push(done);
    });
    expect(seen.at(-1)).toBe(5);
  });
});
