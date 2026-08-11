import { z } from 'zod';
import { COLOR_THEMES } from '../data/themes';
import { BACKUP_TABLES } from './backup';

/** A backup file is user-editable external input (docs/data-model.md §7-1
 *  rule 4), so every row is parsed rather than trusted. Shapes mirror
 *  db/types.ts; ID/DateStr/TimeStr/Epoch/Minor are TS-only brands with no
 *  runtime distinction, so they collapse to plain string/number checks here.
 *
 *  Every shape is `looseObject`, never `object`: zod strips unknown keys by
 *  default, and this file is a mirror of types.ts maintained by hand. Under
 *  `object`, adding a column to types.ts and forgetting to add it here would
 *  delete that column from every row on the next restore, with no error and
 *  nothing in the UI to notice. Keeping unknown keys makes the mirror falling
 *  behind lossless instead of destructive — validation still rejects rows
 *  that get the known fields wrong. */

const id = z.string().min(1);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeStr = z.string().regex(/^\d{2}:\d{2}$/);
const epoch = z.number();
const minor = z.number();
const txType = z.enum(['expense', 'income']);

const expenseSchema = z.looseObject({
  id,
  date: dateStr,
  time: timeStr,
  amount: minor,
  type: txType,
  categoryId: id,
  subLabel: z.string().optional(),
  paymentMethodId: id,
  memo: z.string().optional(),
  recurringRuleId: id.optional(),
  occurrenceDate: dateStr.optional(),
  createdAt: epoch,
  updatedAt: epoch,
});

const categorySchema = z.looseObject({
  id,
  presetKey: z.string().optional(),
  type: txType,
  name: z.string(),
  colorHex: z.string(),
  iconPath: z.string(),
  subs: z.array(z.string()),
  visibleOnHome: z.boolean(),
  sortOrder: z.number(),
  archived: z.boolean(),
  deprecated: z.boolean().optional(),
  customizedFields: z.array(z.string()),
  createdAt: epoch,
  updatedAt: epoch,
});

const paymentMethodSchema = z.looseObject({
  id,
  presetKey: z.string().optional(),
  kind: z.enum(['cash', 'credit', 'debit']),
  name: z.string(),
  tag: z.string().optional(),
  colorHex: z.string(),
  accountId: id.optional(),
  paymentDay: z.number().optional(),
  statementStartDay: z.number().optional(),
  statementEndDay: z.number().optional(),
  performanceThreshold: minor.optional(),
  sortOrder: z.number(),
  archived: z.boolean(),
  createdAt: epoch,
  updatedAt: epoch,
});

const accountSchema = z.looseObject({
  id,
  name: z.string(),
  kind: z.enum(['cash', 'checking', 'savings', 'investment', 'other']),
  balance: minor,
  balanceAsOf: dateStr,
  sortOrder: z.number(),
  archived: z.boolean(),
  createdAt: epoch,
  updatedAt: epoch,
});

const budgetSchema = z.looseObject({
  id,
  period: z.enum(['month', 'week']),
  scope: z.enum(['total', 'category']),
  categoryId: z.union([id, z.literal('*')]),
  periodStart: dateStr,
  periodEnd: dateStr,
  amount: minor,
  createdAt: epoch,
  updatedAt: epoch,
});

const recurringRuleSchema = z.looseObject({
  id,
  name: z.string(),
  amount: minor,
  type: txType,
  categoryId: id,
  subLabel: z.string().optional(),
  paymentMethodId: id,
  memo: z.string().optional(),
  lastUsedAt: epoch.optional(),
  /* 이 필드가 생기기 전 백업에는 없다. isTemplateVisible()이 없을 때를
     표시로 읽으므로, 복원한 규칙은 입력 화면에 그대로 나온다. */
  visibleOnHome: z.boolean().optional(),
  createdAt: epoch,
  updatedAt: epoch,

  /* Left over from when these ran on a schedule. Optional rather than
     removed: a backup made by that version must still restore, and a row that
     failed validation here would be dropped silently rather than kept with
     fields nothing reads. */
  interval: z.enum(['weekly', 'monthly', 'yearly']).optional(),
  dayOfMonth: z.number().optional(),
  weekday: z.number().optional(),
  monthOfYear: z.number().optional(),
  startDate: dateStr.optional(),
  endDate: dateStr.optional(),
  nextRunDate: dateStr.optional(),
  lastRunDate: dateStr.optional(),
  mode: z.enum(['auto', 'remind']).optional(),
  active: z.boolean().optional(),
});

const settingsSchema = z.looseObject({
  id: z.literal('app'),
  monthStartDay: z.number(),
  weekStartDay: z.number(),
  defaultPaymentMethodId: id.optional(),
  baseCurrency: z.literal('KRW'),
  reminderEnabled: z.boolean(),
  reminderTime: timeStr.optional(),
  themeMode: z.enum(['light', 'dark', 'system']),
  /* 이 필드가 생기기 전 백업에는 없다. 없으면 기본 팔레트로 읽으므로
     복원한 기기는 테마 기능이 없던 때와 같은 화면으로 시작한다. */
  colorTheme: z.enum(COLOR_THEMES.map((t) => t.id)).optional(),
  budgetAlertThresholds: z.array(z.number()),
  updatedAt: epoch,
});

const tombstoneSchema = z.looseObject({
  id,
  table: z.string(),
  deletedAt: epoch,
  payload: z.unknown().optional(),
});

const metaSchema = z.looseObject({
  key: z.enum(['deviceId', 'presetVersion', 'installedAt', 'lastBackupAt', 'lastBackupReminderAt']),
  value: z.unknown(),
  updatedAt: epoch,
});

export const TABLE_SCHEMAS = {
  expenses: expenseSchema,
  categories: categorySchema,
  paymentMethods: paymentMethodSchema,
  accounts: accountSchema,
  budgets: budgetSchema,
  recurringRules: recurringRuleSchema,
  settings: settingsSchema,
  tombstones: tombstoneSchema,
  meta: metaSchema,
} satisfies Record<(typeof BACKUP_TABLES)[number], z.ZodType>;

export const BackupEnvelopeSchema = z.looseObject({
  formatVersion: z.number(),
  schemaVersion: z.number(),
  appVersion: z.string(),
  exportedAt: z.string(),
  deviceId: z.string(),
  counts: z.record(z.string(), z.number()),
  data: z.record(z.string(), z.array(z.unknown())),
});
