import { afterEach, describe, expect, it, vi } from 'vitest';

import { PRESET_CATEGORIES } from '../data/categories';
import { PRESET_PAYMENTS } from '../data/payments';
import { buildBackupFile } from './backup';
import { db } from './db';
import { addExpense } from './expenses';
import {
  parseBackupFile,
  RestoreAbortedError,
  restoreBackupFile,
  RestoreFormatError,
} from './restore';
import { bootstrap } from './seed';
import * as download from '../lib/download';
import type { HandoffResult } from '../lib/download';

type BackupShape = Record<string, unknown>;

function backupFile(over: BackupShape = {}, dataOver: BackupShape = {}): File {
  const body = {
    formatVersion: 1,
    schemaVersion: 1,
    appVersion: '0.1.0',
    exportedAt: '2026-07-01T10:00:00.000Z',
    deviceId: 'SOURCE-DEVICE',
    counts: {},
    ...over,
    data: {
      expenses: [],
      categories: [],
      paymentMethods: [],
      accounts: [],
      budgets: [],
      recurringRules: [],
      settings: [],
      tombstones: [],
      meta: [],
      ...dataOver,
    },
  };
  return new File([JSON.stringify(body)], 'backup.json', { type: 'application/json' });
}

const expenseRow = (over: BackupShape = {}) => ({
  id: 'e1',
  date: '2026-08-03',
  time: '10:00',
  amount: 1000,
  type: 'expense',
  categoryId: 'food',
  paymentMethodId: 'cash',
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

/** The real one reaches an <a download> click, which does nothing useful here
 *  and writes noise to the jsdom console. */
function silenceSafetyDownload() {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
}

describe('backup round trip', () => {
  it('restores every table and the month total unchanged', async () => {
    await bootstrap();
    await addExpense({ amount: 12000, categoryId: 'food', paymentMethodId: 'cash' });
    await addExpense({ amount: 3400, categoryId: 'transit', paymentMethodId: 'cash' });

    const before = {
      expenses: await db.expenses.count(),
      categories: await db.categories.count(),
      paymentMethods: await db.paymentMethods.count(),
      total: (await db.expenses.toArray()).reduce((s, e) => s + e.amount, 0),
    };

    const snapshot = await buildBackupFile();
    silenceSafetyDownload();
    await db.expenses.clear();

    const parsed = await parseBackupFile(
      new File([JSON.stringify(snapshot)], 'b.json', { type: 'application/json' }),
    );
    await restoreBackupFile(parsed);

    expect(await db.expenses.count()).toBe(before.expenses);
    expect(await db.categories.count()).toBe(before.categories);
    expect(await db.paymentMethods.count()).toBe(before.paymentMethods);
    expect((await db.expenses.toArray()).reduce((s, e) => s + e.amount, 0)).toBe(before.total);
  });
});

describe('restore recovers bootstrap invariants', () => {
  it('re-seeds presets and settings when the backup lost them', async () => {
    await bootstrap();
    silenceSafetyDownload();

    // Every catalogue table emptied — what row-level validation dropping them
    // looks like. presetVersion rides along, which used to convince
    // reconcileCategories it had nothing to do.
    const parsed = await parseBackupFile(
      backupFile({}, {
        expenses: [expenseRow()],
        meta: [{ key: 'presetVersion', value: 1, updatedAt: 1 }],
      }),
    );
    await restoreBackupFile(parsed);

    expect(await db.categories.count()).toBe(PRESET_CATEGORIES.length);
    expect(await db.paymentMethods.count()).toBe(PRESET_PAYMENTS.length);
    expect(await db.settings.get('app')).toBeDefined();
    expect(await db.expenses.count()).toBe(1);
  });

  it('keeps this install’s deviceId rather than the backup’s', async () => {
    await bootstrap();
    const localDeviceId = (await db.meta.get('deviceId'))?.value;
    silenceSafetyDownload();

    const parsed = await parseBackupFile(
      backupFile({}, { meta: [{ key: 'deviceId', value: 'SOURCE-DEVICE', updatedAt: 1 }] }),
    );
    await restoreBackupFile(parsed);

    expect((await db.meta.get('deviceId'))?.value).toBe(localDeviceId);
    expect((await db.meta.get('deviceId'))?.value).not.toBe('SOURCE-DEVICE');
  });
});

describe('restore validation', () => {
  it('drops malformed rows but keeps the rest', async () => {
    const parsed = await parseBackupFile(
      backupFile({}, { expenses: [expenseRow(), { id: 'bad', amount: 'nope' }] }),
    );
    expect(parsed.validCounts.expenses).toBe(1);
    expect(parsed.skippedCounts.expenses).toBe(1);
  });

  it('preserves columns the schema does not know about', async () => {
    const parsed = await parseBackupFile(
      backupFile({}, { expenses: [expenseRow({ futureColumn: 'keep me' })] }),
    );
    // restoreSchema.ts is a hand-maintained mirror of types.ts. Under a strict
    // object it would silently delete any column the mirror had fallen behind
    // on, from every row, on the next restore.
    expect(parsed.tables.expenses[0]).toHaveProperty('futureColumn', 'keep me');
  });

  it('refuses a backup written by a newer format or schema', async () => {
    await expect(parseBackupFile(backupFile({ formatVersion: 2 }))).rejects.toBeInstanceOf(
      RestoreFormatError,
    );
    await expect(
      parseBackupFile(backupFile({ schemaVersion: db.verno + 1 })),
    ).rejects.toBeInstanceOf(RestoreFormatError);
  });

  it('accepts a backup from the current schema version', async () => {
    await expect(parseBackupFile(backupFile({ schemaVersion: db.verno }))).resolves.toBeDefined();
  });
});

describe('pre-restore safety copy', () => {
  /** The guard's decision now turns on what became of the file, so these mock
   *  the hand-off itself rather than the Web Share API. The old tests stubbed
   *  `navigator.canShare` to stand in for the native path, but jsdom is never
   *  `isNative`, so they exercised the web branch while claiming otherwise —
   *  and that mismatch is what hid the real bug: on Android `canShare` does
   *  not exist at all, so the guard was permanently off there. */
  function stubHandoff(result: HandoffResult) {
    vi.spyOn(download, 'shareOrDownload').mockResolvedValue(result);
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses to restore when the user dismissed the share sheet', async () => {
    await bootstrap();
    await addExpense({ amount: 9900, categoryId: 'food', paymentMethodId: 'cash' });
    stubHandoff('cancelled');

    const parsed = await parseBackupFile(backupFile({}, { expenses: [expenseRow()] }));

    await expect(restoreBackupFile(parsed)).rejects.toBeInstanceOf(RestoreAbortedError);
    // The point of stopping: the data the copy was meant to protect is intact.
    const rows = await db.expenses.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(9900);
  });

  it('restores once the share sheet took the file', async () => {
    await bootstrap();
    await addExpense({ amount: 9900, categoryId: 'food', paymentMethodId: 'cash' });
    stubHandoff('shared');

    const parsed = await parseBackupFile(backupFile({}, { expenses: [expenseRow()] }));
    await restoreBackupFile(parsed);

    const rows = await db.expenses.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(1000);
  });

  /* The desktop failure this replaced: a dismissed share sheet falls through
     to a download that actually works, and the restore used to abort anyway
     with the safety copy already sitting in the user's Downloads folder. */
  it('restores when the file went out as a plain download', async () => {
    await bootstrap();
    stubHandoff('downloaded');

    const parsed = await parseBackupFile(backupFile({}, { expenses: [expenseRow()] }));
    await expect(restoreBackupFile(parsed)).resolves.toBeGreaterThan(0);
    expect(await db.expenses.count()).toBe(1);
  });

  it('leaves the database untouched when it refuses', async () => {
    await bootstrap();
    await addExpense({ amount: 9900, categoryId: 'food', paymentMethodId: 'cash' });
    const before = await db.expenses.toArray();
    stubHandoff('cancelled');

    const parsed = await parseBackupFile(backupFile({}, { expenses: [expenseRow()] }));
    await expect(restoreBackupFile(parsed)).rejects.toBeInstanceOf(RestoreAbortedError);

    expect(await db.expenses.toArray()).toEqual(before);
  });
});

describe('dangling reference reporting', () => {
  it('stays quiet about preset ids that bootstrap will put back', async () => {
    const parsed = await parseBackupFile(
      backupFile({}, {
        expenses: [expenseRow({ id: 'e1', categoryId: 'food', paymentMethodId: 'cash' })],
      }),
    );
    expect(parsed.dangling.total).toBe(0);
  });

  it('counts references nothing will restore', async () => {
    const parsed = await parseBackupFile(
      backupFile({}, {
        expenses: [
          expenseRow({ id: 'e1', categoryId: 'deleted-category' }),
          expenseRow({ id: 'e2', paymentMethodId: 'deleted-card' }),
        ],
      }),
    );
    expect(parsed.dangling.expenses).toBe(2);
  });

  it('flags preset payment ids when the table is only partly lost', async () => {
    const survivor = {
      id: 'kept-card',
      kind: 'credit',
      name: '남은카드',
      colorHex: '#fff',
      sortOrder: 1,
      archived: false,
      createdAt: 1,
      updatedAt: 1,
    };
    const parsed = await parseBackupFile(
      backupFile({}, {
        // seedPaymentMethods only fires on a completely empty table, so 'cash'
        // is genuinely not coming back here.
        paymentMethods: [survivor],
        expenses: [
          expenseRow({ id: 'e1', paymentMethodId: 'cash' }),
          expenseRow({ id: 'e2', paymentMethodId: 'kept-card' }),
        ],
      }),
    );
    expect(parsed.dangling.expenses).toBe(1);
  });

  it('does not treat a total-scope budget as a category reference', async () => {
    const budget = (over: BackupShape) => ({
      id: 'b1',
      period: 'month',
      scope: 'total',
      categoryId: '*',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      amount: 100,
      createdAt: 1,
      updatedAt: 1,
      ...over,
    });
    const parsed = await parseBackupFile(
      backupFile({}, {
        budgets: [
          budget({}),
          budget({ id: 'b2', scope: 'category', categoryId: 'deleted-category' }),
        ],
      }),
    );
    expect(parsed.dangling.budgets).toBe(1);
  });
});
