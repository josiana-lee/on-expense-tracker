import { describe, expect, it } from 'vitest';

import { db } from '../db';
import { addExpense } from '../expenses';
import { bootstrap } from '../seed';
import { runImport } from './commit';
import { planImport } from './plan';
import { keepImport, readLastImport, undoImport } from './undo';
import { parseWeple } from './weple';

const HEAD = '사용자,거래일,수입/지출,금액,분류,하위 분류,내역,지불,카드,메모';
const file = (...lines: string[]) => [HEAD, ...lines].join('\n');

async function importFile(text: string) {
  await bootstrap();
  const [categories, payments] = await Promise.all([
    db.categories.toArray(),
    db.paymentMethods.toArray(),
  ]);
  const plan = planImport(parseWeple(text), categories, payments);
  return runImport(plan, new Map());
}

const TWO = file(
  '내 가계부,2026-01-01,지출,"1,000",식비,,가,카드,롯데카드,',
  '내 가계부,2026-01-02,지출,"2,000",식비,,나,현금,현금,',
);

describe('가져온 기록 되돌리기', () => {
  it('가져온 기록에 같은 표시가 붙는다', async () => {
    await bootstrap();
    await addExpense({ amount: 500, categoryId: 'food', paymentMethodId: 'cash' });
    const out = await importFile(TWO);

    const tagged = (await db.expenses.toArray()).filter((r) => r.importId === out.last!.id);
    expect(tagged).toHaveLength(2);
    // 원래 있던 기록에는 표시가 없다.
    expect((await db.expenses.toArray()).filter((r) => !r.importId)).toHaveLength(1);
  });

  it('되돌리면 가져오기 전 상태로 돌아간다', async () => {
    await bootstrap();
    await addExpense({ amount: 500, categoryId: 'food', paymentMethodId: 'cash' });
    const before = {
      expenses: await db.expenses.count(),
      payments: await db.paymentMethods.count(),
    };

    await importFile(TWO);
    const last = await readLastImport();
    expect(last).not.toBeNull();

    const out = await undoImport(last!);

    expect(out.removed).toBe(2);
    expect(await db.expenses.count()).toBe(before.expenses);
    // 가져오면서 만든 롯데카드도 같이 사라진다.
    expect(await db.paymentMethods.count()).toBe(before.payments);
    expect(await readLastImport()).toBeNull();
  });

  /* 가져온 뒤에 직접 적은 기록까지 지우면 "되돌리기"가 아니라 "일부 잃기"가
     된다. 표시가 있는 것만 지운다. */
  it('가져온 뒤에 직접 적은 기록은 남긴다', async () => {
    await importFile(TWO);
    const last = await readLastImport();
    const mine = await addExpense({ amount: 9999, categoryId: 'food', paymentMethodId: 'cash' });

    await undoImport(last!);

    expect(await db.expenses.get(mine)).toBeDefined();
  });

  /* 되돌린 뒤에 롯데카드로 직접 적은 기록이 있으면, 카드를 지우는 순간 그
     기록이 결제수단 없는 줄이 된다. 쓰는 곳이 남아 있으면 카드는 둔다. */
  it('만든 결제수단이 아직 쓰이고 있으면 남긴다', async () => {
    await importFile(TWO);
    const lotte = (await db.paymentMethods.toArray()).find((p) => p.name === '롯데카드')!;
    const last = await readLastImport();
    await addExpense({ amount: 100, categoryId: 'food', paymentMethodId: lotte.id });

    const out = await undoImport(last!);

    expect(out.removedPayments).toBe(0);
    expect(await db.paymentMethods.get(lotte.id)).toBeDefined();
  });

  /* 이미 쓰던 카드는 가져오기가 만든 것이 아니므로 어떤 경우에도 건드리지
     않는다. */
  it('원래 있던 결제수단은 지우지 않는다', async () => {
    await importFile(TWO);
    const last = await readLastImport();
    await undoImport(last!);
    expect(await db.paymentMethods.get('cash')).toBeDefined();
  });

  it('할부로 묶인 회차도 통째로 지운다', async () => {
    await importFile(
      file(
        '내 가계부,2026-01-01,지출,"100,000",식비,,노트북(1/3),카드,삼성카드,',
        '내 가계부,2026-02-01,지출,"100,000",식비,,노트북(2/3),카드,삼성카드,',
        '내 가계부,2026-03-01,지출,"100,000",식비,,노트북(3/3),카드,삼성카드,',
      ),
    );
    const last = await readLastImport();
    expect((await db.expenses.toArray()).filter((r) => r.installmentId)).toHaveLength(3);

    await undoImport(last!);

    expect((await db.expenses.toArray()).filter((r) => r.installmentId)).toHaveLength(0);
  });

  describe('이대로 쓰기', () => {
    it('기록은 그대로 두고 되돌리기 표시만 지운다', async () => {
      await importFile(TWO);
      const count = await db.expenses.count();

      await keepImport();

      expect(await readLastImport()).toBeNull();
      expect(await db.expenses.count()).toBe(count);
    });
  });

  describe('남은 가져오기가 없을 때', () => {
    /* 백업을 복원하면 가져온 기록이 통째로 바뀐다. 표시만 남고 기록은 없는
       상태에서 "0건을 지웠어"로 끝나야지, 오류가 나면 안 된다. */
    it('지울 게 없어도 오류 없이 표시를 정리한다', async () => {
      await importFile(TWO);
      const last = await readLastImport();
      await db.expenses.clear();

      const out = await undoImport(last!);

      expect(out.removed).toBe(0);
      expect(await readLastImport()).toBeNull();
    });
  });

  /* 되돌릴 수 있는 건 마지막 하나뿐이다. 새로 가져오면 표시가 그쪽으로
     옮겨가고, 앞의 것은 그대로 남는다 — 화면이 둘을 다룰 이유가 없다. */
  it('새로 가져오면 되돌릴 대상이 새 것으로 바뀐다', async () => {
    const first = await importFile(TWO);
    const second = await importFile(
      file('내 가계부,2026-02-01,지출,"3,000",식비,,다,현금,현금,'),
    );
    expect((await readLastImport())?.id).toBe(second.last!.id);

    await undoImport((await readLastImport())!);

    // 앞의 가져오기는 건드리지 않았다.
    expect((await db.expenses.toArray()).filter((r) => r.importId === first.last!.id)).toHaveLength(2);
  });

  it('아무것도 못 가져왔으면 되돌릴 표시를 남기지 않는다', async () => {
    // 모든 행이 "가져오지 않기"인 경우처럼 한 건도 안 들어갔을 때.
    await bootstrap();
    const [categories, payments] = await Promise.all([
      db.categories.toArray(),
      db.paymentMethods.toArray(),
    ]);
    const plan = planImport(
      parseWeple(file('내 가계부,2026-01-01,지출,"1,000",카드대금,,갚음,현금,현금,')),
      categories,
      payments,
    );
    await runImport(plan, new Map([['카드대금', null]]));
    expect(await readLastImport()).toBeNull();
  });
});
