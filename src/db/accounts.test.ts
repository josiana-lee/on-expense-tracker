import { describe, expect, it } from 'vitest';

import { addAccount, updateAccount } from './accounts';
import { db } from './db';

describe('updateAccount', () => {
  it('keeps the balance when only the name changes', async () => {
    const id = await addAccount({ name: '농협 주거래', kind: 'checking', balance: 500000 });

    await updateAccount(id, { name: '농협 월급통장' });

    const row = await db.accounts.get(id);
    // Dexie reads `undefined` in a patch as "delete this field", so building
    // the patch by spread used to drop balance off the record entirely.
    expect(row).toHaveProperty('balance');
    expect(row?.balance).toBe(500000);
    expect(row?.name).toBe('농협 월급통장');
  });

  it('keeps the balance when only the kind changes', async () => {
    const id = await addAccount({ name: '적금', kind: 'checking', balance: 120000 });

    await updateAccount(id, { kind: 'savings' });

    const row = await db.accounts.get(id);
    expect(row?.balance).toBe(120000);
    expect(row?.kind).toBe('savings');
  });

  it('moves balanceAsOf only when the balance itself is set', async () => {
    const id = await addAccount({ name: '현금', kind: 'cash', balance: 30000 });
    await db.accounts.update(id, { balanceAsOf: '2020-01-01' });

    await updateAccount(id, { name: '비상금' });
    expect((await db.accounts.get(id))?.balanceAsOf).toBe('2020-01-01');

    await updateAccount(id, { balance: 45000 });
    const after = await db.accounts.get(id);
    expect(after?.balance).toBe(45000);
    expect(after?.balanceAsOf).not.toBe('2020-01-01');
  });
});
