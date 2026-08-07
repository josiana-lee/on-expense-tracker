/** UUIDv7 문자열. 모든 테이블의 PK. */
export type ID = string;

/** 통화 최소단위 정수. KRW는 지수 0이라 그냥 '원'.
 *  브랜드 타입인 이유는 소수점 금액이 컴파일 단계에서 걸리게 하기 위해서다. */
export type Minor = number & { readonly __brand: 'Minor' };

/** 기기 로컬 달력일 'YYYY-MM-DD'. UTC 아님. */
export type DateStr = string;

/** 기기 로컬 시각 'HH:mm'. 표시 전용. */
export type TimeStr = string;

/** Date.now() 기준 epoch ms. */
export type Epoch = number;

export type TxType = 'expense' | 'income';

export function toMinor(won: number): Minor {
  const v = Math.round(won);
  if (!Number.isSafeInteger(v)) throw new RangeError('amount out of safe integer range');
  return v as Minor;
}

export interface ExpenseRecord {
  id: ID;
  date: DateStr;
  time: TimeStr;
  amount: Minor;
  /** 기록 시점 카테고리에서 복사한 스냅샷. 카테고리를 나중에 입금으로 바꿔도
   *  과거 기록의 부호가 뒤집히지 않게 한다. */
  type: TxType;
  categoryId: ID;
  /** 세부항목은 id가 아니라 이름 문자열 스냅샷. 사용자가 subs 배열을 편집해도
   *  과거 기록이 깨지지 않는다. */
  subLabel?: string;
  paymentMethodId: ID;
  memo?: string;

  /** 반복 지출이 자동 생성한 기록에만 존재. 둘의 조합이 유니크 인덱스라
   *  catch-up 로직이 여러 번 돌아도 중복 생성되지 않는다. */
  recurringRuleId?: ID;
  occurrenceDate?: DateStr;

  createdAt: Epoch;
  updatedAt: Epoch;
}

export interface CategoryRecord {
  /** 프리셋은 presetKey와 같은 값, 사용자 생성은 uuidv7(). */
  id: ID;
  presetKey?: string;
  type: TxType;
  name: string;
  colorHex: string;
  /** SVG path의 d 속성. 24x24 viewBox 기준. */
  iconPath: string;
  subs: string[];
  visibleOnHome: boolean;
  sortOrder: number;
  /** 과거 기록의 참조를 지키기 위해 카테고리는 하드 삭제하지 않는다. */
  archived: boolean;
  /** 앱 업데이트로 프리셋 카탈로그에서 빠진 항목. */
  deprecated?: boolean;
  /** 사용자가 직접 고친 필드 이름들. 여기 있는 필드는 프리셋 업데이트가 건드리지 않는다. */
  customizedFields: string[];
  createdAt: Epoch;
  updatedAt: Epoch;
}

export type PaymentKind = 'cash' | 'credit' | 'debit';

export interface PaymentMethodRecord {
  id: ID;
  presetKey?: string;
  kind: PaymentKind;
  name: string;
  tag?: string;
  colorHex: string;
  accountId?: ID;

  /** 신용카드 전용. 결제일만으로는 결제/미결제를 가를 수 없어 사용기간을 직접 받는다. */
  paymentDay?: number;
  statementStartDay?: number;
  statementEndDay?: number;
  performanceThreshold?: Minor;

  sortOrder: number;
  archived: boolean;
  createdAt: Epoch;
  updatedAt: Epoch;
}

export interface AccountRecord {
  id: ID;
  name: string;
  kind: 'cash' | 'checking' | 'savings' | 'investment' | 'other';
  /** 은행 연동이 없으므로 사용자가 입력한 스냅샷이다. 지출로 자동 차감하지 않는다. */
  balance: Minor;
  balanceAsOf: DateStr;
  sortOrder: number;
  archived: boolean;
  createdAt: Epoch;
  updatedAt: Epoch;
}

export interface BudgetRecord {
  id: ID;
  period: 'month' | 'week';
  scope: 'total' | 'category';
  /** total이면 '*' 센티널. undefined를 쓰면 복합 인덱스에서 레코드가 통째로 빠진다. */
  categoryId: ID | '*';
  /** 경계를 저장해 둔다. 월 시작일 설정을 바꿔도 과거 예산의 의미가 소급되지 않는다. */
  periodStart: DateStr;
  periodEnd: DateStr;
  amount: Minor;
  createdAt: Epoch;
  updatedAt: Epoch;
}

export interface BudgetAlertRecord {
  id: ID;
  budgetId: ID;
  threshold: number;
  firedAt: Epoch;
}

export interface RecurringRuleRecord {
  id: ID;
  name: string;
  amount: Minor;
  type: TxType;
  categoryId: ID;
  subLabel?: string;
  paymentMethodId: ID;
  memo?: string;

  /** Orders the list so the templates actually used drift to the front. */
  lastUsedAt?: Epoch;

  /** 입력 탭 금액 시트에 칩으로 띄울지. 없으면 표시로 친다 — 스케줄을 쓰던
   *  시절에 만든 규칙은 이 필드가 없는데, 업데이트 한 번에 쓰던 게 조용히
   *  사라지는 쪽이 하나 더 보이는 쪽보다 나쁘다. isTemplateVisible()로 읽어라. */
  visibleOnHome?: boolean;

  createdAt: Epoch;
  updatedAt: Epoch;

  /* Written by the scheduled version of this feature, which was removed. Kept
     optional so a backup made before that still restores instead of failing
     validation; nothing reads them. */
  interval?: 'weekly' | 'monthly' | 'yearly';
  dayOfMonth?: number;
  weekday?: number;
  monthOfYear?: number;
  startDate?: DateStr;
  endDate?: DateStr;
  nextRunDate?: DateStr;
  lastRunDate?: DateStr;
  mode?: 'auto' | 'remind';
  active?: boolean;
}

export interface SettingsRecord {
  id: 'app';
  /** 1~28. 29~31은 2월에 정의할 수 없다. */
  monthStartDay: number;
  /** 0(일) ~ 6(토) */
  weekStartDay: number;
  defaultPaymentMethodId?: ID;
  baseCurrency: 'KRW';
  reminderEnabled: boolean;
  reminderTime?: TimeStr;
  themeMode: 'light' | 'dark' | 'system';
  budgetAlertThresholds: number[];
  updatedAt: Epoch;
}

export interface TombstoneRecord {
  /** 삭제된 레코드의 id를 그대로 쓴다. */
  id: ID;
  table: string;
  deletedAt: Epoch;
  /** 휴지통/실행취소용 원본. 30일 후 제거한다. */
  payload?: unknown;
}

export type MetaKey =
  | 'deviceId'
  | 'presetVersion'
  | 'installedAt'
  | 'lastBackupAt'
  | 'lastBackupReminderAt';

export interface MetaRecord {
  key: MetaKey;
  value: unknown;
  updatedAt: Epoch;
}
