import { describe, expect, it } from 'vitest';

import { db } from '../db';
import { addExpense } from '../expenses';
import { addRecurringRule } from '../recurring';
import { bootstrap } from '../seed';
import { updateSettings } from '../settings';
import { runImport } from './commit';
import { planImport } from './plan';
import { findImportedFile } from './imported';
import { listImports, undoImport } from './undo';
import { parseWeple } from './weple';

const HEAD = '사용자,거래일,수입/지출,금액,분류,하위 분류,내역,지불,카드,메모';
const file = (...lines: string[]) => [HEAD, ...lines].join('\n');

async function importFile(text: string, fingerprint?: string) {
  await bootstrap();
  const [categories, payments] = await Promise.all([
    db.categories.toArray(),
    db.paymentMethods.toArray(),
  ]);
  const plan = { ...planImport(parseWeple(text), categories, payments), fingerprint };
  return runImport(plan, new Map());
}

/** 가져오기 두 번 사이에 시각이 달라지게 한다. 목록은 가져온 시각으로 줄을 세운다. */
const tick = () => new Promise((r) => setTimeout(r, 3));

const latest = async () => (await listImports())[0];

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
    const entry = await latest();
    expect(entry).toBeDefined();

    const out = await undoImport(entry);

    expect(out.removed).toBe(2);
    expect(await db.expenses.count()).toBe(before.expenses);
    // 가져오면서 만든 롯데카드도 같이 사라진다.
    expect(await db.paymentMethods.count()).toBe(before.payments);
    expect(await listImports()).toEqual([]);
  });

  /* 가져온 뒤에 직접 적은 기록까지 지우면 "되돌리기"가 아니라 "일부 잃기"가
     된다. 표시가 있는 것만 지운다. */
  it('가져온 뒤에 직접 적은 기록은 남긴다', async () => {
    await importFile(TWO);
    const entry = await latest();
    const mine = await addExpense({ amount: 9999, categoryId: 'food', paymentMethodId: 'cash' });

    await undoImport(entry);

    expect(await db.expenses.get(mine)).toBeDefined();
  });

  /* 되돌린 뒤에 롯데카드로 직접 적은 기록이 있으면, 카드를 지우는 순간 그
     기록이 결제수단 없는 줄이 된다. 쓰는 곳이 남아 있으면 카드는 둔다. */
  it('만든 결제수단이 아직 쓰이고 있으면 남긴다', async () => {
    await importFile(TWO);
    const lotte = (await db.paymentMethods.toArray()).find((p) => p.name === '롯데카드')!;
    const entry = await latest();
    await addExpense({ amount: 100, categoryId: 'food', paymentMethodId: lotte.id });

    const out = await undoImport(entry);

    expect(out.removedPayments).toBe(0);
    expect(await db.paymentMethods.get(lotte.id)).toBeDefined();
  });

  /* 이 앱은 카드를 지우지 않고 보관한다. 되돌리기가 처음으로 하드 삭제를 하는데,
     기본 결제수단이 그 카드였다면 설정이 죽은 id를 가리키고, 입력 화면은 그 값을
     확인하지 않아서 결제수단 없는 지출이 저장됐다. 쓰는 곳이 있으면 지우지 않는다. */
  it('기본 결제수단으로 정한 카드는 지우지 않는다', async () => {
    await importFile(TWO);
    const lotte = (await db.paymentMethods.toArray()).find((p) => p.name === '롯데카드')!;
    await updateSettings({ defaultPaymentMethodId: lotte.id });

    const out = await undoImport(await latest());

    expect(out.removedPayments).toBe(0);
    expect(await db.paymentMethods.get(lotte.id)).toBeDefined();
  });

  it('저장해둔 지출이 쓰는 카드는 지우지 않는다', async () => {
    await importFile(TWO);
    const lotte = (await db.paymentMethods.toArray()).find((p) => p.name === '롯데카드')!;
    await addRecurringRule({
      name: '구독',
      amount: 9900,
      categoryId: 'food',
      paymentMethodId: lotte.id,
    });

    const out = await undoImport(await latest());

    expect(out.removedPayments).toBe(0);
    expect(await db.paymentMethods.get(lotte.id)).toBeDefined();
  });

  /* 이미 쓰던 카드는 가져오기가 만든 것이 아니므로 어떤 경우에도 건드리지
     않는다. */
  it('원래 있던 결제수단은 지우지 않는다', async () => {
    await importFile(TWO);
    await undoImport(await latest());
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
    const entry = await latest();
    expect((await db.expenses.toArray()).filter((r) => r.installmentId)).toHaveLength(3);

    await undoImport(entry);

    expect((await db.expenses.toArray()).filter((r) => r.installmentId)).toHaveLength(0);
  });

  describe('가져온 파일 기억', () => {
    /* 항목이 남으면 지운 기록을 "이미 가져온 파일"이라고 막는다. */
    it('되돌리면 그 파일을 다시 가져올 수 있다', async () => {
      await importFile(TWO, 'file-1');
      expect(await findImportedFile('file-1')).not.toBeNull();

      await undoImport(await latest());

      expect(await findImportedFile('file-1')).toBeNull();
    });

    it('다른 가져오기의 항목은 건드리지 않는다', async () => {
      await importFile(TWO, 'file-a');
      await tick();
      await importFile(file('내 가계부,2026-02-01,지출,"3,000",식비,,다,현금,현금,'), 'file-b');

      await undoImport(await latest());

      expect(await findImportedFile('file-b')).toBeNull();
      expect(await findImportedFile('file-a')).not.toBeNull();
    });
  });

  describe('남은 가져오기가 없을 때', () => {
    /* 백업을 복원하면 가져온 기록이 통째로 바뀐다. 표시만 남고 기록은 없는
       상태에서 "0건을 지웠어"로 끝나야지, 오류가 나면 안 된다. */
    it('지울 게 없어도 오류 없이 끝난다', async () => {
      await importFile(TWO);
      const entry = await latest();
      await db.expenses.clear();

      const out = await undoImport(entry);

      expect(out.removed).toBe(0);
    });
  });

  it('아무것도 못 가져왔으면 목록에도 없다', async () => {
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
    expect(await listImports()).toEqual([]);
  });
});

/* 되돌릴 수 있는 게 마지막 하나뿐이던 때, 같은 파일을 실수로 두 번 넣으면 정작 되돌리고
   싶은 첫 번째를 지울 길이 없었다. 목록은 기록에 붙은 표시에서 만든다. */
describe('가져온 기록 목록', () => {
  it('가져오기별로 묶어서 새것부터 보여준다', async () => {
    await importFile(TWO);
    await tick();
    await importFile(file('내 가계부,2026-02-01,지출,"3,000",식비,,다,현금,현금,'));

    const list = await listImports();

    expect(list.map((e) => e.count)).toEqual([1, 2]);
    expect(list.map((e) => e.spend)).toEqual([3000, 3000]);
  });

  it('손으로 적은 기록은 목록에 없다', async () => {
    await bootstrap();
    await addExpense({ amount: 500, categoryId: 'food', paymentMethodId: 'cash' });
    expect(await listImports()).toEqual([]);
  });

  /* 이게 이 목록이 생긴 이유다. */
  it('같은 파일을 두 번 넣었어도 첫 번째를 골라 되돌릴 수 있다', async () => {
    await importFile(TWO);
    await tick();
    await importFile(TWO);
    expect(await db.expenses.count()).toBeGreaterThanOrEqual(4);

    const [second, first] = await listImports();
    await undoImport(first);

    const left = await listImports();
    expect(left).toHaveLength(1);
    expect(left[0].id).toBe(second.id);
    // 두 번째 가져오기의 기록은 그대로다.
    expect((await db.expenses.toArray()).filter((r) => r.importId === second.id)).toHaveLength(2);
  });

  /* 가져온 뒤에 몇 건을 지웠으면 그만큼 줄어 있다. 가져온 건수를 그대로 보여주면 되돌렸을 때
     지워지는 수와 안 맞는다. */
  it('건수와 합계는 지금 남아 있는 기록으로 센다', async () => {
    await importFile(TWO);
    const [{ id }] = await listImports();
    const one = (await db.expenses.toArray()).find((r) => r.importId === id && r.amount === 1000)!;
    await db.expenses.delete(one.id);

    const [entry] = await listImports();

    expect(entry.count).toBe(1);
    expect(entry.spend).toBe(2000);
  });

  it('기록이 전부 없어지면 목록에서도 사라진다', async () => {
    await importFile(TWO);
    await db.expenses.clear();
    expect(await listImports()).toEqual([]);
  });

  /* 항목이 생기기 전에 가져온 기록(v18)도 표시가 있으니 목록에 나온다. 카드 정보가 없을
     뿐이라 되돌려도 카드는 남는다. */
  it('가져온 파일 항목이 없는 옛 가져오기도 보인다', async () => {
    await bootstrap();
    await addExpense({ amount: 700, categoryId: 'food', paymentMethodId: 'cash', importId: 'old' });

    const [entry] = await listImports();

    expect(entry).toMatchObject({ id: 'old', count: 1, spend: 700, createdPaymentIds: [] });
    expect(entry.at).toBeGreaterThan(0);
  });

  it('가져오면서 만든 카드는 항목에서 알아 와서 되돌릴 때 같이 치운다', async () => {
    await bootstrap();
    const before = await db.paymentMethods.count();
    await importFile(TWO);
    const [entry] = await listImports();
    expect(entry.createdPaymentIds).toHaveLength(1);

    const out = await undoImport(entry);

    expect(out.removedPayments).toBe(1);
    expect(await db.paymentMethods.count()).toBe(before);
  });

  it('가져오기 전에 있던 기록은 되돌려도 그대로다', async () => {
    await bootstrap();
    const mine = await addExpense({ amount: 500, categoryId: 'food', paymentMethodId: 'cash' });
    await importFile(TWO);
    await tick();
    await importFile(TWO);

    for (const e of await listImports()) await undoImport(e);

    expect(await db.expenses.get(mine)).toBeDefined();
    expect(await db.expenses.count()).toBe(1);
  });
});
