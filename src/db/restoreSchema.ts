import { z } from 'zod';
import { BACKUP_TABLES } from './backup';

/** A backup file is user-editable external input (docs/data-model.md §7-1
 *  rule 4), so every row is parsed rather than trusted. Shapes mirror
 *  db/types.ts; ID/DateStr/TimeStr/Epoch/Minor are TS-only brands with no
 *  runtime distinction, so they collapse to plain string/number checks here. */

const id = z.string().min(1);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeStr = z.string().regex(/^\d{2}:\d{2}$/);
const epoch = z.number();
const minor = z.number();
const txType = z.enum(['expense', 'income']);

const expenseSchema = z.object({
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

const categorySchema = z.object({
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

const paymentMethodSchema = z.object({
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

const accountSchema = z.object({
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

const budgetSchema = z.object({
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

const recurringRuleSchema = z.object({
  id,
  name: z.string(),
  amount: minor,
  type: txType,
  categoryId: id,
  subLabel: z.string().optional(),
  paymentMethodId: id,
  memo: z.string().optional(),
  interval: z.enum(['weekly', 'monthly', 'yearly']),
  dayOfMonth: z.number().optional(),
  weekday: z.number().optional(),
  monthOfYear: z.number().optional(),
  startDate: dateStr,
  endDate: dateStr.optional(),
  nextRunDate: dateStr,
  lastRunDate: dateStr.optional(),
  mode: z.enum(['auto', 'remind']),
  active: z.boolean(),
  createdAt: epoch,
  updatedAt: epoch,
});

const settingsSchema = z.object({
  id: z.literal('app'),
  monthStartDay: z.number(),
  weekStartDay: z.number(),
  defaultPaymentMethodId: id.optional(),
  baseCurrency: z.literal('KRW'),
  reminderEnabled: z.boolean(),
  reminderTime: timeStr.optional(),
  themeMode: z.enum(['light', 'dark', 'system']),
  budgetAlertThresholds: z.array(z.number()),
  updatedAt: epoch,
});

const tombstoneSchema = z.object({
  id,
  table: z.string(),
  deletedAt: epoch,
  payload: z.unknown().optional(),
});

const metaSchema = z.object({
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

export const BackupEnvelopeSchema = z.object({
  formatVersion: z.number(),
  schemaVersion: z.number(),
  appVersion: z.string(),
  exportedAt: z.string(),
  deviceId: z.string(),
  counts: z.record(z.string(), z.number()),
  data: z.record(z.string(), z.array(z.unknown())),
});
