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
    //
    // 반복 지출이 스케줄에서 원탭 템플릿으로 바뀌면서 남은 인덱스 두 개
    // (expenses의 &[recurringRuleId+occurrenceDate], recurringRules의
    // nextRunDate)는 일부러 그대로 뒀다. 지우려면 버전을 올려야 하고,
    // 그건 이미 설치된 기기의 DB를 건드리는 일이라 얻는 것보다 위험이 크다.
    // 두 필드 모두 이제 아무도 쓰지 않아 undefined이고, Dexie는 키 일부가
    // undefined인 행을 색인하지 않으므로 unique 제약도 함께 잠들어 있다.
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
    /* 읽어오는 건 있는지 확인하려는 것뿐이다. 없는 id로 툼스톤을 만들면,
       지운 적 없는 행이 지워진 것으로 기록된다.
       내용은 복사하지 않는다 — payload는 휴지통/실행취소 화면만을 위한
       것이었는데 그걸 만들지 않기로 했다. 지우면 지워지고, 다시 필요하면
       사용자가 다시 적는다. 안 쓰는 사본을 30일씩 들고 있으면 백업 파일마다
       그게 같이 실려 나가고 복원하면 같이 들어온다. */
    const row = await db[table].get(id);
    if (!row) return;
    await db[table].delete(id);
    await db.tombstones.put({ id, table, deletedAt: now() });
  });
}
