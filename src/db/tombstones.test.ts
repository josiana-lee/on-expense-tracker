import { describe, expect, it } from 'vitest';

import { db, deleteWithTombstone } from './db';
import { addExpense } from './expenses';
import { bootstrap } from './seed';
import { pruneTombstones } from './tombstones';

const DAY = 24 * 60 * 60 * 1000;

async function tombstoneAged(id: string, ageDays: number) {
  await db.tombstones.put({
    id,
    table: 'expenses',
    deletedAt: Date.now() - ageDays * DAY,
    payload: { id, amount: 1234 },
  });
}

describe('tombstone retention', () => {
  it('keeps recent rows whole, strips older payloads, drops the oldest rows', async () => {
    await tombstoneAged('fresh', 5);
    await tombstoneAged('mid', 45);
    await tombstoneAged('edge', 179);
    await tombstoneAged('old', 181);
    await tombstoneAged('ancient', 400);

    await pruneTombstones();

    const byId = new Map((await db.tombstones.toArray()).map((t) => [t.id, t]));
    expect([...byId.keys()].sort()).toEqual(['edge', 'fresh', 'mid']);
    // Inside the trash window the original row is still recoverable.
    expect(byId.get('fresh')).toHaveProperty('payload');
    expect(byId.get('mid')).not.toHaveProperty('payload');
    expect(byId.get('edge')).not.toHaveProperty('payload');
  });

  it('leaves the deletion record itself intact when it strips a payload', async () => {
    await tombstoneAged('mid', 45);

    await pruneTombstones();

    const row = await db.tombstones.get('mid');
    // Sync needs to know the row was deleted rather than never seen, which is
    // the whole reason the tombstone outlives its payload.
    expect(row).toBeDefined();
    expect(row?.table).toBe('expenses');
    expect(row?.deletedAt).toBeTypeOf('number');
  });

  it('does not touch a tombstone written just now', async () => {
    await bootstrap();
    const id = await addExpense({ amount: 5000, categoryId: 'food', paymentMethodId: 'cash' });
    await deleteWithTombstone('expenses', id);

    await pruneTombstones();

    expect(await db.tombstones.get(id)).toHaveProperty('payload');
  });
});
