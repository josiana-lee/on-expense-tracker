import { describe, expect, it } from 'vitest';

import { db, deleteWithTombstone } from './db';
import { addExpense } from './expenses';
import { bootstrap } from './seed';
import { pruneTombstones } from './tombstones';

const DAY = 24 * 60 * 60 * 1000;

/** 업데이트 전에 만들어진 툼스톤을 흉내 낸다 — 그때는 지운 행의 내용이
 *  payload로 같이 저장됐다. */
async function legacyTombstone(id: string, ageDays: number) {
  await db.tombstones.put({
    id,
    table: 'expenses',
    deletedAt: Date.now() - ageDays * DAY,
    payload: { id, amount: 1234 },
  });
}

describe('tombstone retention', () => {
  it('180일이 지난 행은 버리고 나머지는 남긴다', async () => {
    await legacyTombstone('fresh', 5);
    await legacyTombstone('edge', 179);
    await legacyTombstone('old', 181);
    await legacyTombstone('ancient', 400);

    await pruneTombstones();

    const ids = (await db.tombstones.toArray()).map((t) => t.id).sort();
    expect(ids).toEqual(['edge', 'fresh']);
  });

  /* 되돌리기 화면을 만들지 않기로 하면서 payload는 쓸 데가 없어졌다. 이미
     깔린 기기에는 남아 있으므로, 나이와 상관없이 걷어낸다 — 안 그러면 백업
     파일마다 지운 기록의 전체 내용이 계속 같이 실려 나간다. */
  it('예전에 저장된 payload를 나이와 상관없이 걷어낸다', async () => {
    await legacyTombstone('fresh', 5);
    await legacyTombstone('edge', 179);

    await pruneTombstones();

    const byId = new Map((await db.tombstones.toArray()).map((t) => [t.id, t]));
    expect(byId.get('fresh')).not.toHaveProperty('payload');
    expect(byId.get('edge')).not.toHaveProperty('payload');
  });

  it('payload를 걷어내도 삭제 기록 자체는 남는다', async () => {
    await legacyTombstone('mid', 45);

    await pruneTombstones();

    const row = await db.tombstones.get('mid');
    /* 툼스톤이 남는 이유는 되살리기 위해서가 아니라, 그 행이 "지워졌다"와
       "본 적 없다"를 구분하기 위해서다. */
    expect(row).toBeDefined();
    expect(row?.table).toBe('expenses');
    expect(row?.deletedAt).toBeTypeOf('number');
  });

  it('새로 지우는 행에는 내용을 복사하지 않는다', async () => {
    await bootstrap();
    const id = await addExpense({ amount: 5000, categoryId: 'food', paymentMethodId: 'cash' });

    await deleteWithTombstone('expenses', id);

    const row = await db.tombstones.get(id);
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty('payload');
    // 지운 행은 진짜로 사라진다.
    expect(await db.expenses.get(id)).toBeUndefined();
  });
});
