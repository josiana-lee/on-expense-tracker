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
/* 앱 안에서 만들어지는 값은 toMinor()가 정수·안전범위를 보장하지만, 복원은
   그 함수를 한 번도 거치지 않는다 — 파싱한 행이 bulkPut으로 바로 들어간다.
   백업 파일은 이 앱의 유일한 외부 입력인데 하필 그 경로만 불변식을 비켜간
   셈이었다.

   z.number()는 NaN과 Infinity는 막지만 1.5와 1e21은 통과시킨다. 실제로
   확인했다 — 금액 1.5와 1e21이 든 백업을 복원하면 두 행 모두 유효로 잡히고,
   그 달 합계가 1e+21이 된다. 달력·예산 진행률·카드 청구액이 한꺼번에
   의미를 잃는다. 소수점 금액은 조용히 표시만 깨뜨린다. */
const epoch = z.number().int().min(0);
const minor = z
  .number()
  .int()
  .min(-Number.MAX_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);
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
  /* 할부. 회차 번호와 개월 수는 화면에 "2/3"으로 그대로 찍히므로 정수·양수만
     받는다 — 백업 파일을 손으로 고쳐 12.5를 넣으면 달력에 그대로 나온다.
     묶음이 깨진 행(예: installmentId만 있고 회차가 없는 행)은 여기서 거르지
     않는다. 행 단위 검사라 형제 회차를 볼 수 없고, 지출 자체는 멀쩡해서
     버리면 오히려 돈이 사라진다. 화면 쪽 isInstallment()가 필드가 갖춰진
     행만 할부로 취급한다. */
  installmentId: id.optional(),
  installmentNo: z.number().int().min(1).optional(),
  /* 상한을 두지 않는다. 앱이 받는 개월 수가 나중에 늘어나면, 상한이 있는
     구버전 앱에서 그 백업을 복원할 때 해당 행이 통째로 버려진다 — 검증이
     돈을 지우는 셈이다. 정수·양수만 확인하고, 실제 한도는 입력 쪽이 건다. */
  installmentMonths: z.number().int().min(1).optional(),
  installmentTotal: minor.optional(),
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
  /* types.ts가 못박아 둔 범위(1~28, 0~6)가 런타임 어디에도 없었다. 복원된
     monthStartDay: 45는 monthRange()에서 다음 달로 롤오버하고, weekStartDay가
     범위를 벗어나면 splitWeeks()의 주차 구분이 뭉개진다.
     여기서 걸러 행이 버려져도 bootstrap()의 ensureSettings()가 기본값으로
     되살리므로, 조이는 비용이 사실상 없다. */
  monthStartDay: z.number().int().min(1).max(28),
  weekStartDay: z.number().int().min(0).max(6),
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
