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
import {
  addRecurringRule,
  isTemplateVisible,
  setRecurringVisible,
  templateAmountText,
} from './recurring';
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

  /* 1.0.0이 쓴 반복 지출은 스케줄 필드를 달고 있고 visibleOnHome/lastUsedAt이
     없다. 그 백업을 지금 빌드로 복원하는 건 내부 테스트에서 실제로 일어날
     일이고, 규칙이 통째로 버려지거나 입력 화면에서 사라지면 사용자가 원인을
     알 수 없다. 스키마 버전을 올리지 않은 선택이 여기서 값을 치른다. */
  it('restores a 1.0.0 recurring rule and still shows it', async () => {
    const scheduled = {
      id: 'r1',
      name: '월세',
      amount: 600000,
      type: 'expense',
      categoryId: 'housing',
      paymentMethodId: 'cash',
      interval: 'monthly',
      dayOfMonth: 25,
      startDate: '2026-01-25',
      nextRunDate: '2026-09-25',
      lastRunDate: '2026-08-25',
      mode: 'remind',
      active: true,
      createdAt: 1,
      updatedAt: 1,
    };

    const parsed = await parseBackupFile(backupFile({}, { recurringRules: [scheduled] }));
    expect(parsed.skippedCounts.recurringRules ?? 0).toBe(0);
    expect(parsed.validCounts.recurringRules).toBe(1);

    silenceSafetyDownload();
    await restoreBackupFile(parsed);

    const restored = await db.recurringRules.get('r1');
    expect(restored).toBeDefined();
    expect(restored!.name).toBe('월세');
    expect(restored!.amount).toBe(600000);
    // 표시 여부가 없는 규칙은 표시로 읽는다 — 업데이트 한 번에 조용히
    // 사라지는 쪽이 하나 더 보이는 쪽보다 나쁘다.
    expect(isTemplateVisible(restored!)).toBe(true);
    expect(templateAmountText(restored!)).toBe('600000');
  });

  /* 반대 방향. 숨겨둔 게 복원하고 나서 다시 나타나면, 사용자가 껐다는 사실이
     백업을 거치며 사라진 것이다 — 조용하고, 되돌리려면 또 꺼야 한다. */
  it('keeps a hidden template hidden through a real backup', async () => {
    await bootstrap();
    await addRecurringRule({
      name: '넷플릭스',
      amount: 17000,
      categoryId: 'food',
      paymentMethodId: 'cash',
    });
    const [made] = await db.recurringRules.toArray();
    await setRecurringVisible(made.id, false);

    const snapshot = await buildBackupFile();
    silenceSafetyDownload();
    await db.recurringRules.clear();

    const parsed = await parseBackupFile(
      new File([JSON.stringify(snapshot)], 'b.json', { type: 'application/json' }),
    );
    await restoreBackupFile(parsed);

    const back = await db.recurringRules.get(made.id);
    expect(back).toBeDefined();
    expect(isTemplateVisible(back!)).toBe(false);
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
