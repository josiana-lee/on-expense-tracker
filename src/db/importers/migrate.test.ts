import { describe, expect, it } from 'vitest';

import { db } from '../db';
import { addExpense } from '../expenses';
import { bootstrap } from '../seed';
import { moveImportedTitlesToMemo } from './migrate';

/** 옛 가져오기가 만든 모양의 기록. 제목이 세부항목 칸에 있다. */
const legacy = (over: Partial<Parameters<typeof addExpense>[0]> = {}) =>
  addExpense({ amount: 1000, categoryId: 'pet', paymentMethodId: 'cash', importId: 'old', ...over });

/** 이미 한 번 돌았다는 표시를 지워서, 옛 모양을 심고 다시 돌릴 수 있게 한다. */
async function rearm() {
  await db.meta.delete('importedTitlesMoved');
}

describe('moveImportedTitlesToMemo', () => {
  /* 수정 화면에서 가져온 기록의 제목을 고칠 수 없던 문제다. 세부항목은 칩으로 고르는 칸이라
     글자를 쓸 칸이 아니었다. */
  it('메모가 비어 있는 가져온 기록은 세부항목의 글을 메모로 옮긴다', async () => {
    await bootstrap();
    const id = await legacy({ subLabel: '퍼릿 자동화장실' });
    await rearm();

    expect(await moveImportedTitlesToMemo()).toBe(1);

    const row = await db.expenses.get(id);
    expect(row?.memo).toBe('퍼릿 자동화장실');
    expect(row?.subLabel).toBeUndefined();
  });

  /* 세부항목의 글이 내역인지 하위 분류인지 알 수 없다 — 원본이 하위 분류를 줬으면 내역이 메모로
     갔다. 잘못 합치느니 그대로 둔다. */
  it('메모가 이미 있는 가져온 기록은 건드리지 않는다', async () => {
    await bootstrap();
    const id = await legacy({ subLabel: '점심', memo: '식물원 김밥' });
    await rearm();

    expect(await moveImportedTitlesToMemo()).toBe(0);

    const row = await db.expenses.get(id);
    expect(row?.subLabel).toBe('점심');
    expect(row?.memo).toBe('식물원 김밥');
  });

  it('직접 입력한 기록은 건드리지 않는다', async () => {
    await bootstrap();
    const id = await addExpense({
      amount: 1000,
      categoryId: 'food',
      paymentMethodId: 'cash',
      subLabel: '점심',
    });
    await rearm();

    await moveImportedTitlesToMemo();

    expect((await db.expenses.get(id))?.subLabel).toBe('점심');
  });

  it('세부항목이 없는 가져온 기록은 그대로다', async () => {
    await bootstrap();
    const id = await legacy({ memo: '이미 메모' });
    await rearm();
    await moveImportedTitlesToMemo();
    expect((await db.expenses.get(id))?.memo).toBe('이미 메모');
  });

  /* 이게 표시를 남기는 이유다. 매번 돌면, 새로 가져온 기록 중 세부항목만 있는 것(하위 분류만 있고
     내역이 없는 행)까지 메모로 옮겨 버린다. */
  it('한 번만 한다 — 그 뒤에 들어온 세부항목만 있는 기록은 그대로다', async () => {
    await bootstrap();
    await rearm();
    await moveImportedTitlesToMemo();

    const id = await legacy({ subLabel: '택시' });
    expect(await moveImportedTitlesToMemo()).toBe(0);

    const row = await db.expenses.get(id);
    expect(row?.subLabel).toBe('택시');
    expect(row?.memo).toBeUndefined();
  });

  it('앱을 켤 때(bootstrap) 한 번 돈다', async () => {
    await bootstrap();
    const id = await legacy({ subLabel: '퍼릿 자동화장실' });
    await rearm();

    await bootstrap();

    expect((await db.expenses.get(id))?.memo).toBe('퍼릿 자동화장실');
    expect(await db.meta.get('importedTitlesMoved')).toBeDefined();
  });

  it('글은 지우지 않고 옮기기만 한다', async () => {
    await bootstrap();
    const ids = await Promise.all(
      ['사료', '병원', '미용'].map((subLabel) => legacy({ subLabel })),
    );
    await rearm();
    await moveImportedTitlesToMemo();
    const memos = (await Promise.all(ids.map((id) => db.expenses.get(id)))).map((r) => r?.memo);
    expect(memos).toEqual(['사료', '병원', '미용']);
  });
});
