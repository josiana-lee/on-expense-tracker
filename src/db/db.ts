import Dexie, { type EntityTable } from 'dexie';
import type {
  AccountRecord,
  BudgetAlertRecord,
  BudgetRecord,
  CategoryRecord,
  ExpenseRecord,
  MetaRecord,
  PaymentMethodRecord,
  RecurringRuleRecord,
  SettingsRecord,
  TombstoneRecord,
} from './types';

export class AppDB extends Dexie {
  expenses!: EntityTable<ExpenseRecord, 'id'>;
  categories!: EntityTable<CategoryRecord, 'id'>;
  paymentMethods!: EntityTable<PaymentMethodRecord, 'id'>;
  accounts!: EntityTable<AccountRecord, 'id'>;
  budgets!: EntityTable<BudgetRecord, 'id'>;
  budgetAlerts!: EntityTable<BudgetAlertRecord, 'id'>;
  recurringRules!: EntityTable<RecurringRuleRecord, 'id'>;
  settings!: EntityTable<SettingsRecord, 'id'>;
  tombstones!: EntityTable<TombstoneRecord, 'id'>;
  meta!: EntityTable<MetaRecord, 'key'>;

  constructor() {
    super('on-expense-tracker');

    // 'id'에 ++ 가 없는 것은 의도적 — PK를 앱이 UUIDv7로 직접 만든다.
    this.version(1).stores({
      expenses: 'id, date, updatedAt, &[recurringRuleId+occurrenceDate]',
      categories: 'id, &presetKey, updatedAt',
      paymentMethods: 'id, &presetKey, updatedAt',
      accounts: 'id, updatedAt',
      budgets: 'id, &[period+scope+categoryId+periodStart], periodStart, updatedAt',
      budgetAlerts: 'id, &[budgetId+threshold]',
      recurringRules: 'id, nextRunDate, updatedAt',
      settings: 'id',
      tombstones: 'id, [table+deletedAt], deletedAt',
      meta: 'key',
    });
  }
}

export const db = new AppDB();

/** 하드 삭제 + 툼스톤. deletedAt 컬럼을 두지 않는 이유는 그렇게 하면 달력·월합계·예산
 *  등 모든 조회에 필터가 붙고, 한 번만 빠뜨려도 지운 지출이 합계에 섞이기 때문이다. */
export async function deleteWithTombstone(
  table: 'expenses' | 'accounts' | 'budgets' | 'recurringRules',
  id: string,
): Promise<void> {
  const { now } = await import('./id');
  await db.transaction('rw', db[table], db.tombstones, async () => {
    const row = await db[table].get(id);
    if (!row) return;
    await db[table].delete(id);
    await db.tombstones.put({ id, table, deletedAt: now(), payload: row });
  });
}
