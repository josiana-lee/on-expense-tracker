import { afterEach, describe, expect, it, vi } from 'vitest';

import { db } from '../db';
import { bootstrap } from '../seed';
import { listInstallmentGroup } from '../installments';
import { parseWeple } from './weple';
import { planImport } from './plan';
import { runImport } from './commit';
import { findImportedFile } from './imported';
import { listImports } from './undo';
import type { ImportParse } from './types';

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
    // 내역은 메모(= 제목)에 들어간다. 세부항목 칸에 넣으면 수정 화면에서 고칠 수 없다.
    expect(row?.memo).toBe('반지');
    expect(row?.subLabel).toBeUndefined();
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
      expect(group[0].memo).toBe('노트북');
    });

    it('회차가 비면 할부가 아니라 일반 지출로 들어간다', async () => {
      const p = await plan(
        file(
          '내 가계부,2026-01-01,지출,"100,000",식비,,가방(1/3),카드,삼성카드,',
          '내 가계부,2026-03-01,지출,"100,000",식비,,가방(3/3),카드,삼성카드,',
        ),
      );
      await runImport(p, new Map());
      const saved = (await db.expenses.toArray()).filter((r) => r.memo?.startsWith('가방'));
      expect(saved).toHaveLength(2);
      expect(saved.every((r) => r.installmentId === undefined)).toBe(true);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const parse = (rows: ImportParse['rows']): ImportParse => ({
    source: 'x',
    rows,
    income: 0,
    skipped: 0,
  });
  const row = (over: Partial<ImportParse['rows'][number]> = {}): ImportParse['rows'][number] => ({
    date: '2026-01-01' as ImportParse['rows'][number]['date'],
    amount: 1000,
    categoryName: '식비',
    paymentName: '현금',
    paymentKind: 'cash',
    ...over,
  });
  async function planOf(p: ImportParse) {
    await bootstrap();
    const [categories, payments] = await Promise.all([
      db.categories.toArray(),
      db.paymentMethods.toArray(),
    ]);
    return planImport(p, categories, payments);
  }

  /* 선배 리뷰와 QA가 같은 곳을 짚었다. 예전에는 카드를 먼저 만들고 기록을 300건씩
     따로 커밋하고 되돌리기 정보를 맨 마지막에 저장해서, 중간에 멈추면 이미 들어간
     기록과 만들어진 카드가 남는데 되돌릴 방법이 없었다. 토스트는 "다시 시도해줘"라고
     해서 시도하면 중복까지 생겼다. 이제 전부 한 트랜잭션이다. */
  describe('한 번에 들어가거나 하나도 안 들어간다', () => {
    it('중간에 실패하면 기록도 카드도 되돌리기 정보도 남지 않는다', async () => {
      const p = await plan(
        file(
          '내 가계부,2026-01-01,지출,"1,000",식비,,가,카드,롯데카드,',
          '내 가계부,2026-01-02,지출,"2,000",식비,,나,카드,신한카드,',
        ),
      );
      const before = { e: await db.expenses.count(), p: await db.paymentMethods.count() };
      vi.spyOn(db.expenses, 'bulkAdd').mockRejectedValue(new Error('QuotaExceeded'));

      await expect(runImport(p, new Map())).rejects.toThrow();

      expect(await db.expenses.count()).toBe(before.e);
      expect(await db.paymentMethods.count()).toBe(before.p);
      expect(await listImports()).toEqual([]);
    });

    it('실패한 뒤 다시 시도하면 중복 없이 한 번만 들어간다', async () => {
      const p = await plan(file('내 가계부,2026-01-01,지출,"1,000",식비,,가,카드,롯데카드,'));
      const spy = vi.spyOn(db.expenses, 'bulkAdd').mockRejectedValueOnce(new Error('boom'));
      await expect(runImport(p, new Map())).rejects.toThrow();
      spy.mockRestore();

      const out = await runImport(p, new Map());

      expect(out.added).toBe(1);
      expect((await db.expenses.toArray()).filter((r) => r.memo === '가')).toHaveLength(1);
      expect((await db.paymentMethods.toArray()).filter((x) => x.name === '롯데카드')).toHaveLength(1);
    });
  });

  describe('돌려주는 되돌리기 정보', () => {
    it('기록에 붙은 표시와 같은 정보를 돌려준다', async () => {
      const p = await plan(file('내 가계부,2026-01-01,지출,"1,000",식비,,가,카드,롯데카드,'));
      const out = await runImport(p, new Map());

      expect(out.last).not.toBeNull();
      expect(out.last!.count).toBe(1);
      expect(out.last!.createdPaymentIds).toHaveLength(1);
      expect((await db.expenses.toArray()).at(-1)?.importId).toBe(out.last!.id);
    });

    /* 화면은 방금 한 가져오기의 결과를 보여줘야 한다. 예전에는 저장소에서 마지막
       정보를 다시 읽었는데, 이번에 한 건도 안 들어갔으면 **이전** 가져오기가 읽혀서
       "방금 가져왔어!"로 뜨고, 거기서 되돌리면 엉뚱한 걸 지웠다. */
    it('한 건도 안 들어갔으면 null이고, 이전 정보는 건드리지 않는다', async () => {
      await runImport(await plan(file('내 가계부,2026-01-01,지출,"1,000",식비,,가,현금,현금,')), new Map());
      const first = await listImports();

      const second = await runImport(
        await plan(file('내 가계부,2026-01-02,지출,"1,000",카드대금,,갚음,현금,현금,')),
        new Map([['카드대금', null]]),
      );

      expect(second.last).toBeNull();
      expect(await listImports()).toEqual(first);
    });
  });

  describe('가져온 파일 기억', () => {
    it('지문이 있으면 이 가져오기를 그 파일로 기억한다', async () => {
      const p = { ...(await plan(file('내 가계부,2026-01-01,지출,"1,000",식비,,가,카드,롯데카드,'))), fingerprint: 'abc' };
      const out = await runImport(p, new Map());

      const found = await findImportedFile('abc');
      expect(found?.importId).toBe(out.last!.id);
      expect(found?.count).toBe(1);
      // 되돌릴 때 같이 치울 카드도 같이 적어 둔다.
      expect(found?.createdPaymentIds).toEqual(out.last!.createdPaymentIds);
    });

    it('지문이 없어도 항목은 남긴다(되돌리기 목록이 쓴다)', async () => {
      const p = await plan(file('내 가계부,2026-01-01,지출,"1,000",식비,,가,현금,현금,'));
      await runImport(p, new Map());
      const kept = (await db.meta.get('importedFiles'))?.value as { hash?: string }[];
      expect(kept).toHaveLength(1);
      expect(kept[0].hash).toBeUndefined();
    });

    /* 기록이 안 들어갔는데 파일만 "가져온 것"으로 남으면 그 파일을 다시는 못 가져온다. */
    it('한 건도 안 들어갔으면 파일도 기억하지 않는다', async () => {
      const p = {
        ...(await plan(file('내 가계부,2026-01-01,지출,"1,000",카드대금,,갚음,현금,현금,'))),
        fingerprint: 'zzz',
      };
      await runImport(p, new Map([['카드대금', null]]));
      expect(await findImportedFile('zzz')).toBeNull();
      expect(await db.meta.get('importedFiles')).toBeUndefined();
    });

    it('도중에 실패하면 파일도 기억하지 않는다', async () => {
      const p = { ...(await plan(file('내 가계부,2026-01-01,지출,"1,000",식비,,가,현금,현금,'))), fingerprint: 'fail' };
      vi.spyOn(db.expenses, 'bulkAdd').mockRejectedValue(new Error('boom'));
      await expect(runImport(p, new Map())).rejects.toThrow();
      expect(await db.meta.get('importedFiles')).toBeUndefined();
    });
  });

  /* 모든 분류를 "가져오지 않기"로 골라도 새 결제수단은 만들어졌다. 쓰는 기록이 하나도
     없는 카드가 자산 탭에 남는다. */
  it('실제로 넣는 기록이 쓰는 결제수단만 만든다', async () => {
    const p = await plan(
      file(
        '내 가계부,2026-01-01,지출,"1,000",카드대금,,갚음,카드,새카드,',
        '내 가계부,2026-01-02,지출,"2,000",식비,,김밥,카드,쓸카드,',
      ),
    );
    const out = await runImport(p, new Map([['카드대금', null]]));

    const names = (await db.paymentMethods.toArray()).map((x) => x.name);
    expect(names).toContain('쓸카드');
    expect(names).not.toContain('새카드');
    expect(out.createdPayments).toBe(1);
  });

  it('모든 분류를 가져오지 않기로 하면 결제수단도 만들지 않는다', async () => {
    const p = await plan(file('내 가계부,2026-01-01,지출,"1,000",카드대금,,갚음,카드,새카드,'));
    const before = await db.paymentMethods.count();

    const out = await runImport(p, new Map([['카드대금', null]]));

    expect(out.added).toBe(0);
    expect(await db.paymentMethods.count()).toBe(before);
  });

  /* 묶음의 일부만 가져오게 되면 남은 회차가 "2개월 할부 1/2"과 총액 10만 원을 달고
     나머지 없이 들어갔다. 코드 주석이 피하겠다고 한 반쪽 할부다. */
  it('할부의 일부 회차만 가져오게 되면 일반 지출로 들어가고 회차는 메모로 남는다', async () => {
    const p = await plan(
      file(
        '내 가계부,2026-01-01,지출,"50,000",식비,,세탁기(1/2),카드,삼성카드,',
        '내 가계부,2026-02-01,지출,"50,000",카드대금,,세탁기(2/2),카드,삼성카드,',
      ),
    );
    await runImport(p, new Map([['카드대금', null]]));

    const saved = (await db.expenses.toArray()).filter((r) => r.memo?.startsWith('세탁기'));
    expect(saved).toHaveLength(1);
    expect(saved[0].installmentId).toBeUndefined();
    expect(saved[0].installmentTotal).toBeUndefined();
    expect(saved[0].memo).toBe('세탁기 · 할부 1/2회차');
  });

  /* plan이 하위를 상위로 묶으면 행의 분류 이름도 바뀐다. 커밋이 원래 이름으로 찾으면
     맞은 카테고리를 못 찾아 기록이 사라진다. */
  it('하위가 안 맞아 상위로 묶인 기록도 상위의 카테고리로 저장된다', async () => {
    const p = await planOf(
      parse([
        row({ categoryName: '외식', parentName: '식비', label: '점심' }),
        row({ categoryName: '간식', parentName: '식비', label: '과자' }),
      ]),
    );
    const out = await runImport(p, new Map());
    expect(out.added).toBe(2);
    const saved = await db.expenses.toArray();
    expect(saved.find((r) => r.subLabel === '점심')?.categoryId).toBe('food');
    expect(saved.find((r) => r.subLabel === '과자')?.categoryId).toBe('snack');
  });

  /* 가져온 기록이 우리 입력과 같은 모양이어야 한다 — 카테고리, 세부항목(칩 자리), 메모(제목). */
  describe('직접 입력과 같은 칸에 들어간다', () => {
    it('내역은 메모로, 하위 분류는 세부항목으로', async () => {
      const p = await plan(file('내 가계부,2026-01-01,지출,"9,000",식비,점심,식물원 김밥,현금,현금,'));
      await runImport(p, new Map());
      const saved = (await db.expenses.toArray()).at(-1)!;
      expect(saved.categoryId).toBe('food');
      expect(saved.subLabel).toBe('점심');
      expect(saved.memo).toBe('식물원 김밥');
    });

    /* 상위로 묶인 하위 분류는 버리지 않고 세부항목이 된다 — "교통/차량 › 택시". */
    it('상위로 묶인 하위 분류는 세부항목으로 남는다', async () => {
      const p = await planOf(
        parse([row({ categoryName: '외식', parentName: '식비', memo: '추어탕' })]),
      );
      await runImport(p, new Map());
      const saved = (await db.expenses.toArray()).at(-1)!;
      expect(saved.categoryId).toBe('food');
      expect(saved.subLabel).toBe('외식');
      expect(saved.memo).toBe('추어탕');
    });
  });

  it('원본이 시각을 주면 그 시각으로, 안 주면 00:00으로 넣는다', async () => {
    const p = await planOf(
      parse([row({ time: '22:47' }), row({ date: '2026-01-02' as ImportParse['rows'][number]['date'] })]),
    );
    await runImport(p, new Map());
    const saved = await db.expenses.toArray();
    expect(saved.find((r) => r.date === '2026-01-01')?.time).toBe('22:47');
    expect(saved.find((r) => r.date === '2026-01-02')?.time).toBe('00:00');
  });
});
