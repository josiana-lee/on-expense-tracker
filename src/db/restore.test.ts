import { afterEach, describe, expect, it, vi } from 'vitest';

import { PRESET_CATEGORIES } from '../data/categories';
import { PRESET_PAYMENTS } from '../data/payments';
import { buildBackupFile } from './backup';
import { db } from './db';
import { addExpense } from './expenses';
import {
  keepRestore,
  parseBackupFile,
  RestoreAbortedError,
  restoreBackupFile,
  RestoreFormatError,
  undoRestore,
} from './restore';
import { copyDb, readRestoreCopy } from './restoreCopy';
import {
  addRecurringRule,
  isTemplateVisible,
  setRecurringVisible,
  templateAmountText,
} from './recurring';
import { bootstrap } from './seed';

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

  /* 앱 안에서 만드는 값은 toMinor()가 정수·안전범위를 보장하는데, 복원은
     그 함수를 거치지 않는다. 파싱을 통과한 행이 bulkPut으로 바로 들어가므로,
     여기서 안 막으면 아무도 안 막는다. 실제로 1.5와 1e21이 통과해 그 달
     합계가 1e+21이 됐다. */
  it('금액이 정수가 아니거나 안전 범위를 벗어나면 그 행을 버린다', async () => {
    const bad = [
      expenseRow({ id: 'a', amount: 1.5 }),
      expenseRow({ id: 'b', amount: 1e21 }),
      expenseRow({ id: 'c', amount: -0.001 }),
      expenseRow({ id: 'd', amount: 1000 }),
    ];
    const parsed = await parseBackupFile(backupFile({}, { expenses: bad }));
    expect(parsed.validCounts.expenses).toBe(1);
    expect(parsed.skippedCounts.expenses).toBe(3);
    expect((parsed.tables.expenses[0] as { id: string }).id).toBe('d');
  });

  it('월·주 시작일이 범위를 벗어나면 settings 행을 버린다', async () => {
    const rows = [
      { id: 'app', monthStartDay: 45, weekStartDay: 0, baseCurrency: 'KRW',
        reminderEnabled: false, themeMode: 'system', budgetAlertThresholds: [], updatedAt: 1 },
    ];
    const parsed = await parseBackupFile(backupFile({}, { settings: rows }));
    expect(parsed.validCounts.settings).toBe(0);
    expect(parsed.skippedCounts.settings).toBe(1);
  });

  /* 파일 선택기의 accept는 힌트일 뿐이라 동영상도 고를 수 있다. 검증은
     파일을 다 읽은 뒤에야 시작되므로, 그 전에 거절하지 않으면 WebView가
     먼저 죽는다. */
  it('너무 큰 파일은 읽기 전에 거절한다', async () => {
    /* 내용은 완전히 정상인 백업이고 크기만 크다. 내용까지 망가뜨리면
       크기 검사를 빼도 JSON 파싱이 대신 같은 예외를 던져서, 검사가 있으나
       없으나 통과하는 테스트가 된다. */
    const huge = backupFile();
    Object.defineProperty(huge, 'size', { value: 60 * 1024 * 1024 });
    await expect(parseBackupFile(huge)).rejects.toBeInstanceOf(RestoreFormatError);

    // 크기만 정상으로 되돌리면 같은 내용이 통과해야 한다.
    const same = backupFile();
    await expect(parseBackupFile(same)).resolves.toBeDefined();
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

describe('pre-restore copy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const parse = (rows: BackupShape[]) => parseBackupFile(backupFile({}, { expenses: rows }));

  /* 복원은 전부 덮어쓴다. 예전에는 그 전에 공유창을 띄워 파일로 저장하게 했고,
     그 창을 닫으면 복원이 멈췄다. 이제는 앱 안에 사본을 남기고 바로 진행한다 —
     마음에 안 들면 사본으로 되돌린다. */
  it('복원하기 전 데이터를 앱 안에 사본으로 남긴다', async () => {
    await bootstrap();
    await addExpense({ amount: 9900, categoryId: 'food', paymentMethodId: 'cash' });

    await restoreBackupFile(await parse([expenseRow()]));

    const copy = await readRestoreCopy();
    expect(copy).not.toBeNull();
    expect(copy!.expenses).toBe(1);
    // 복원은 그대로 이루어졌다.
    expect((await db.expenses.toArray()).map((r) => r.amount)).toEqual([1000]);
  });

  it('사본으로 되돌리면 복원 전 기록이 그대로 돌아온다', async () => {
    await bootstrap();
    await addExpense({ amount: 9900, categoryId: 'food', paymentMethodId: 'cash' });
    await restoreBackupFile(await parse([expenseRow()]));

    // 돌려주는 값은 복원과 같은 "표 전체 행 수"라 지출 건수가 아니다. 사본이
    // 없을 때의 null과 구분되는 것만 본다.
    expect(await undoRestore()).not.toBeNull();
    expect((await db.expenses.toArray()).map((r) => r.amount)).toEqual([9900]);
    // 쓴 사본은 지워진다. 되돌린 뒤에 또 되돌릴 것은 없다.
    expect(await readRestoreCopy()).toBeNull();
  });

  /* 되돌린다고 새 사본이 생기면 "되돌리기의 되돌리기"가 끝없이 이어지고, 방금
     쓴 사본 자리에 지금 상태가 덮인다. */
  it('사본으로 되돌리는 일은 새 사본을 만들지 않는다', async () => {
    await bootstrap();
    await restoreBackupFile(await parse([expenseRow()]));
    await undoRestore();
    expect(await readRestoreCopy()).toBeNull();
  });

  /* 틀린 파일로 한 번 복원하고, 곧바로 맞는 파일로 또 복원하는 건 자연스러운
     순서다. 두 번째 사본이 첫 번째를 덮으면 "복원 전"이 틀린 파일의 내용이
     되어, 정작 지키고 싶던 원래 데이터가 영영 사라진다. 고르기 전에는 맨 처음
     사본을 둔다. */
  it('연달아 복원해도 사본은 맨 처음 상태다', async () => {
    await bootstrap();
    await addExpense({ amount: 9900, categoryId: 'food', paymentMethodId: 'cash' });
    await restoreBackupFile(await parse([expenseRow({ id: 'wrong', amount: 111 })]));
    await restoreBackupFile(await parse([expenseRow({ id: 'right', amount: 222 })]));

    await undoRestore();

    expect((await db.expenses.toArray()).map((r) => r.amount)).toEqual([9900]);
  });

  it('이대로 쓰기로 하면 사본만 지우고 데이터는 그대로다', async () => {
    await bootstrap();
    await restoreBackupFile(await parse([expenseRow()]));

    await keepRestore();

    expect(await readRestoreCopy()).toBeNull();
    expect(await db.expenses.count()).toBe(1);
  });

  /* 사본이 없는 복원은 예전의 마지막 방어선이 빠진 복원이다. 사본을 못 만들면
     덮어쓰지 않고 멈춘다. 이때 데이터는 손대지 않은 상태여야 한다. */
  it('사본을 못 만들면 복원하지 않고 데이터도 그대로 둔다', async () => {
    await bootstrap();
    await addExpense({ amount: 9900, categoryId: 'food', paymentMethodId: 'cash' });
    const before = await db.expenses.toArray();
    vi.spyOn(copyDb.copies, 'put').mockRejectedValue(new Error('QuotaExceeded'));

    await expect(restoreBackupFile(await parse([expenseRow()]))).rejects.toBeInstanceOf(
      RestoreAbortedError,
    );

    expect(await db.expenses.toArray()).toEqual(before);
  });

  it('돌아갈 사본이 없으면 아무 일도 하지 않는다', async () => {
    await bootstrap();
    await addExpense({ amount: 9900, categoryId: 'food', paymentMethodId: 'cash' });

    expect(await undoRestore()).toBeNull();
    expect(await db.expenses.count()).toBe(1);
  });

  /* deviceId는 이 설치의 것이지 백업의 것이 아니다. 사본으로 돌아갈 때도
     같은 규칙이 적용돼야 한다. */
  it('되돌려도 이 기기의 deviceId는 그대로다', async () => {
    await bootstrap();
    const id = (await db.meta.get('deviceId'))?.value;
    await restoreBackupFile(await parse([expenseRow()]));
    await undoRestore();
    expect((await db.meta.get('deviceId'))?.value).toBe(id);
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
