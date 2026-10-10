import { describe, expect, it } from 'vitest';

import { suggestMemos } from '../lib/memoSuggest';
import { db } from './db';
import { addExpense, deleteExpense } from './expenses';
import { runImport } from './importers/commit';
import { planImport } from './importers/plan';
import { parseWeple } from './importers/weple';
import { loadMemoStats } from './memoStats';
import { bootstrap } from './seed';

const ask = async (text: string, categoryId = 'food', amount = 0) =>
  suggestMemos(await loadMemoStats(), { categoryId, amount, text });

describe('loadMemoStats', () => {
  it('기록의 메모가 후보가 된다', async () => {
    await bootstrap();
    await addExpense({ amount: 6000, categoryId: 'food', paymentMethodId: 'cash', memo: '롯데리아' });
    expect(await ask('롯')).toEqual(['롯데리아']);
  });

  it('메모 없는 기록은 후보를 만들지 않는다', async () => {
    await bootstrap();
    await addExpense({ amount: 6000, categoryId: 'food', paymentMethodId: 'cash' });
    expect(await ask('')).toEqual([]);
  });

  /* 지출을 적는 칸의 후보다. 수입 행의 메모가 섞여 들어오면 "월급" 같은 것이 추천된다. */
  it('수입 기록의 메모는 후보가 아니다', async () => {
    await bootstrap();
    await addExpense({ amount: 3_000_000, categoryId: 'food', paymentMethodId: 'cash', type: 'income', memo: '월급' });
    await addExpense({ amount: 6000, categoryId: 'food', paymentMethodId: 'cash', memo: '월세' });
    expect(await ask('월')).toEqual(['월세']);
  });

  /* 후보를 따로 저장하지 않으니 기록을 지우면 후보도 사라진다. 저장해 두었다면 이 테스트가
     이 기능의 가장 먼저 깨지는 곳이다. */
  it('기록을 지우면 후보도 사라진다', async () => {
    await bootstrap();
    const id = await addExpense({ amount: 6000, categoryId: 'food', paymentMethodId: 'cash', memo: '롯데리아' });
    await deleteExpense(id);
    expect(await ask('롯')).toEqual([]);
  });

  /* 위플에서 가져온 9년치가 처음부터 후보가 되는 게 이 기능의 큰 몫이다. 가져온 기록의
     내역은 메모로 들어간다. */
  it('가져온 기록의 내역도 후보가 된다', async () => {
    await bootstrap();
    const [categories, payments] = await Promise.all([db.categories.toArray(), db.paymentMethods.toArray()]);
    const text = [
      '사용자,거래일,수입/지출,금액,분류,하위 분류,내역,지불,카드,메모',
      '내 가계부,2026-01-01,지출,"6,000",식비,,롯데리아,현금,현금,',
    ].join('\n');
    await runImport(planImport(parseWeple(text), categories, payments), new Map());
    expect(await ask('롯')).toEqual(['롯데리아']);
  });
});
