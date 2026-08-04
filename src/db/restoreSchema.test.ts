import { describe, expect, it } from 'vitest';

import { TABLE_SCHEMAS } from './restoreSchema';
import type {
  AccountRecord,
  BudgetRecord,
  CategoryRecord,
  ExpenseRecord,
  MetaRecord,
  PaymentMethodRecord,
  RecurringRuleRecord,
  SettingsRecord,
  TombstoneRecord,
} from './types';

/* restoreSchema.ts mirrors types.ts by hand, and the two drifting apart is
   invisible at runtime: `looseObject` carries an unknown column through a
   restore untouched, so a forgotten field costs nothing until something tries
   to validate it. These assertions make the drift a compile error instead —
   `pnpm typecheck` covers src, so a field added to types.ts without its
   counterpart here fails the build.

   Only this direction is checked. A schema key with no matching record field
   is harmless, and `id`-style helpers legitimately appear in several shapes. */

type MissingFromSchema<TRecord, TSchema> = TSchema extends { shape: infer Shape }
  ? Exclude<keyof TRecord, keyof Shape>
  : never;

function assertNothingMissing<_T extends never>(): void {}

assertNothingMissing<MissingFromSchema<ExpenseRecord, typeof TABLE_SCHEMAS.expenses>>();
assertNothingMissing<MissingFromSchema<CategoryRecord, typeof TABLE_SCHEMAS.categories>>();
assertNothingMissing<
  MissingFromSchema<PaymentMethodRecord, typeof TABLE_SCHEMAS.paymentMethods>
>();
assertNothingMissing<MissingFromSchema<AccountRecord, typeof TABLE_SCHEMAS.accounts>>();
assertNothingMissing<MissingFromSchema<BudgetRecord, typeof TABLE_SCHEMAS.budgets>>();
assertNothingMissing<
  MissingFromSchema<RecurringRuleRecord, typeof TABLE_SCHEMAS.recurringRules>
>();
assertNothingMissing<MissingFromSchema<SettingsRecord, typeof TABLE_SCHEMAS.settings>>();
assertNothingMissing<MissingFromSchema<TombstoneRecord, typeof TABLE_SCHEMAS.tombstones>>();
assertNothingMissing<MissingFromSchema<MetaRecord, typeof TABLE_SCHEMAS.meta>>();

describe('restoreSchema mirrors types.ts', () => {
  it('declares a shape for every backed-up table', () => {
    // The field-level check above is enforced by tsc; this only guards against
    // a table being added to the backup allowlist with no schema at all.
    for (const [table, schema] of Object.entries(TABLE_SCHEMAS)) {
      expect(Object.keys(schema.shape).length, `${table} has no fields`).toBeGreaterThan(0);
    }
  });

  it('keeps unknown columns instead of stripping them', () => {
    const parsed = TABLE_SCHEMAS.accounts.parse({
      id: 'a1',
      name: '계좌',
      kind: 'checking',
      balance: 1000,
      balanceAsOf: '2026-08-04',
      sortOrder: 1,
      archived: false,
      createdAt: 1,
      updatedAt: 1,
      columnAddedLater: 'keep me',
    });
    expect(parsed).toHaveProperty('columnAddedLater', 'keep me');
  });
});
