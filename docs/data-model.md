# on-expense-tracker 데이터 모델 설계

> 로컬 우선(local-first) 개인 가계부. React 19 + Vite + TS + PWA → Capacitor로 Play Store 출시.
> 이 문서는 데이터 계층만 다룬다. UI/애니메이션은 `design-brief.md` 참조.

## 0. 결정 요약

| 항목 | 결정 | 한 줄 근거 |
|---|---|---|
| 저장소 | **Dexie 유지** | 요구 쿼리가 전부 단순 레인지 스캔. SQL 엔진 불필요 |
| PK | **문자열 UUIDv7** (`++id` 금지) | 나중에 되돌리기 가장 어려운 결정 |
| 금액 | **정수 minor unit** (KRW = 원) | float 쓰면 데이터가 이미 오염됨 |
| 날짜 | **`'YYYY-MM-DD'` 로컬 문자열** | 사전순 = 시간순, 타임존 이동 시 재분류 없음 |
| 삭제 | **하드 삭제 + `tombstones` 테이블** | 핫 경로에 `deletedAt` 필터가 안 붙음 |
| 집계 | **롤업 테이블 없음. 매번 스캔** | 월 200~300행. 롤업은 정합성 부채만 늘어남 |
| 프리셋 | **상수가 원본, DB는 사용자 사본** | 필드 단위 override 추적 |
| 백업 | **1단계 로컬 파일 + Android Auto Backup, 2단계 E2E 암호화 클라우드** | 서버는 필요해질 때만 |
| 카드 명세 주기 | **사용자가 사용기간을 직접 입력** (10장 1번 (a)안 확정) | 카드사마다 달라 역산은 부정확 |
| Pro | **현재 스코프에서 제외. 광고 단일 티어** | 8장은 나중에 되살릴 때를 위한 기록 |

---

## 1. 저장소 선택

### Dexie를 유지한다

검토한 대안과 탈락 사유:

| 후보 | 판단 |
|---|---|
| `idb` (얇은 래퍼) | 마이그레이션 체이닝, `liveQuery`를 직접 만들어야 함. Dexie가 사주는 값이 더 큼 |
| RxDB | 동기화가 내장이지만 번들이 크고 프리미엄 플러그인이 유료. 지금 필요 없는 복잡도 |
| wa-sqlite / OPFS SQLite | SQL 집계는 매력적이지만 wasm ~1MB. 연 수천 건에 SQL 엔진은 과함 |
| Capacitor SQLite 플러그인 | 웹 PWA 빌드가 죽는다. 웹/앱 동시 유지가 불가능해짐 |

Dexie로 가는 결정적 이유는 `dexie-react-hooks`의 `useLiveQuery`다. 쓰기 후 화면 갱신을 수동으로 배선하지 않아도 되고, "추가! 누르면 달력이 즉시 반영"이 공짜로 나온다.

---

## 2. 공통 규약

```ts
// src/db/types.ts

/** UUIDv7 문자열. 모든 테이블의 PK. */
export type ID = string;

/** 통화 최소단위 정수. KRW는 지수 0이므로 그냥 '원'. 절대 소수점을 넣지 않는다. */
export type Minor = number & { readonly __brand: 'Minor' };

/** 기기 로컬 달력일 'YYYY-MM-DD'. UTC 아님. */
export type DateStr = string;

/** 기기 로컬 시각 'HH:mm'. 표시 전용. */
export type TimeStr = string;

/** Date.now() 기준 epoch ms. 감사/동기화 정렬용. */
export type Epoch = number;
```

### 2-1. 금액: 정수 minor unit

```ts
export const toMinor = (won: number): Minor => {
  const v = Math.round(won);
  if (!Number.isSafeInteger(v)) throw new RangeError('amount out of safe integer range');
  return v as Minor;
};
```

- `amount`는 **항상 양수**로 저장한다. 지출/입금은 `type` 필드로 구분한다. 부호로 구분하면 나중에 절댓값 집계할 때마다 실수가 난다.
- 모든 산술은 정수 도메인에서만 한다. 나누기(예: 예산 진행률)는 표시 직전에 한 번만 실수로 바꾼다.

### 2-2. 소수점 통화 대응 — 지금은 넣지 않는다

행마다 `currency`를 넣는 건 **지금 하지 않는다.** "나중에 바꾸기 어려운가?" 기준을 통과하지 못한다:

- 비인덱스 컬럼 추가는 IndexedDB에서 스키마 버전업 없이 가능하고, 기존 행은 `settings.baseCurrency`로 채우면 끝난다 → **나중에 쉽다.**
- 반면 `amount`를 float로 저장했다가 정수로 바꾸는 건 이미 반올림 오차가 섞인 데이터를 되살릴 수 없다 → **지금 못 박아야 한다.**

지금 할 일은 두 가지뿐이다: (1) `Minor` 브랜드 타입으로 정수 규율을 컴파일 타임에 강제, (2) `settings.baseCurrency: 'KRW'` 한 칸. 통화별 지수 테이블(`{ KRW: 0, USD: 2, JPY: 0 }`)은 다통화가 실제로 생길 때 코드에만 추가한다.

### 2-3. 날짜: `'YYYY-MM-DD'` 문자열 (epoch 아님)

**`date: DateStr` + `time: TimeStr` + `createdAt: Epoch` 3종으로 나눠 저장한다.**

문자열 날짜를 고른 이유:

1. IndexedDB 문자열 키는 사전순 정렬 → `'YYYY-MM-DD'`는 사전순 == 시간순. `between()` 레인지 스캔이 그대로 동작한다.
2. **타임존/DST 안정성.** 8월 2일 23:50에 기록한 지출을 사용자가 해외에서 열어도 8월 2일에 남는다. epoch로 저장하면 로컬 변환 결과가 바뀌면서 달력 셀이 움직인다. 가계부에서 이건 명백한 버그다.
3. 월 조회가 `between('2026-08-01', '2026-08-31')`로 끝난다. `yearMonth` 별도 컬럼이 필요 없다.
4. DevTools와 CSV에서 그대로 읽힌다. 1인 개발에서 디버깅 비용은 실질 비용이다.

`createdAt`(epoch)은 별도로 유지한다 — 감사 로그와 동기화 정렬은 실제 UTC 시각이 있어야 한다. `date`/`time`은 "사용자가 주장하는 지출 시각"(수정 가능), `createdAt`은 "실제로 기록된 시각"(불변)으로 의미가 다르다.

**`yearMonth` 파생 컬럼은 두지 않는다.** `date.slice(0, 7)`이고 레인지 쿼리가 이미 커버한다. 인덱스 유지 비용만 늘어난다.

### 2-4. ID 생성 (UUIDv7)

```ts
// src/db/id.ts
export function uuidv7(): ID {
  const ts = Date.now();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[0] = (ts / 2 ** 40) & 0xff;
  b[1] = (ts / 2 ** 32) & 0xff;
  b[2] = (ts / 2 ** 24) & 0xff;
  b[3] = (ts / 2 ** 16) & 0xff;
  b[4] = (ts / 2 ** 8) & 0xff;
  b[5] = ts & 0xff;
  b[6] = (b[6] & 0x0f) | 0x70; // version 7
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** 같은 ms에 여러 번 써도 updatedAt이 뒤로 가지 않게 보장 */
let lastTs = 0;
export function now(): Epoch {
  lastTs = Math.max(Date.now(), lastTs + 1);
  return lastTs;
}
```

v4(`crypto.randomUUID()`)가 아니라 v7인 이유: 시간 정렬이 되어서 IndexedDB B-tree 삽입 지역성이 좋고, `id` 자체가 생성 순서를 담아 정렬 키를 하나 아낀다. 의존성 없이 15줄이다.

---

## 3. 테이블 스키마

### 3-1. Dexie 선언

```ts
// src/db/db.ts
import Dexie, { type EntityTable } from 'dexie';

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

    this.version(1).stores({
      // 'id'에 ++ 없음 = 앱이 PK를 직접 만든다 (UUIDv7)
      expenses:       'id, date, updatedAt, &[recurringRuleId+occurrenceDate]',
      categories:     'id, &presetKey, updatedAt',
      paymentMethods: 'id, updatedAt',
      accounts:       'id, updatedAt',
      budgets:        'id, &[period+scope+categoryId+periodStart], periodStart, updatedAt',
      budgetAlerts:   'id, &[budgetId+threshold]',
      recurringRules: 'id, nextRunDate, updatedAt',
      settings:       'id',
      tombstones:     'id, [table+deletedAt], deletedAt',
      meta:           'key',
    });
  }
}

export const db = new AppDB();
```

### 3-2. 인덱스를 이만큼만 둔 이유

`expenses`에 `[categoryId+date]`, `[paymentMethodId+date]`, `[type+date]`를 **일부러 넣지 않았다.**

요구된 조회 패턴(월 합계, 카테고리별 합계, 카드별 결제액, 주차별 합계)은 전부 **"한 달치를 한 번 읽고 JS에서 그룹핑"** 으로 끝난다. 한 달치는 하루 10건을 넣어도 300행이다. 300행 `toArray()` + `reduce`는 수 ms다. 복합 인덱스를 3개 더 다는 건 쓰기 비용과 마이그레이션 표면적만 늘린다.

**나중에 추가할 조건 (미리 적어둔다):**

- "특정 카테고리 최근 12개월 추이" 화면이 생기면 → `[categoryId+date]`
- "카드 하나의 12개월 전월실적 그래프"가 생기면 → `[paymentMethodId+date]`
- 이들은 전부 **비파괴적 인덱스 추가**라 `version(n+1).stores({ expenses: '...' })` 한 줄이면 된다. 데이터 변환 없음.

`categories` / `paymentMethods` / `accounts` / `settings`는 전부 합쳐 50행 미만이다. **앱 시작 시 한 번 전부 메모리로 올려 React context에 두고, 화면에서는 DB를 치지 않는다.** 그래서 이 테이블들엔 `updatedAt` 외 인덱스가 거의 없다.

### 3-3. 타입 정의

```ts
// src/db/types.ts (이어서)

export type TxType = 'expense' | 'income';

// ---------- 지출 기록 (핵심) ----------
export interface ExpenseRecord {
  id: ID;
  date: DateStr;              // 로컬 달력일. 달력/월합계의 기준 키
  time: TimeStr;              // 'HH:mm' 표시용
  amount: Minor;              // 항상 양수
  type: TxType;               // 기록 시점 카테고리에서 복사한 스냅샷
  categoryId: ID;
  subLabel?: string;          // 세부항목: id가 아니라 '이름 문자열' 스냅샷
  paymentMethodId: ID;
  memo?: string;

  // 반복 지출로 자동 생성된 경우에만 존재 (멱등성 가드)
  recurringRuleId?: ID;
  occurrenceDate?: DateStr;

  createdAt: Epoch;           // 불변
  updatedAt: Epoch;
}
```

**`type`과 `subLabel`을 비정규화한 이유 — 정합성 결정이다.**

- `type`: 사용자가 나중에 카테고리를 지출→입금으로 바꾸면, 과거 3년치 기록의 부호가 조용히 뒤집힌다. 기록 시점의 성격은 기록에 고정한다.
- `subLabel`: 세부항목은 카테고리의 `subs: string[]` 배열이다. 사용자가 배열에서 항목을 지우거나 순서를 바꾸면 인덱스 참조는 깨진다. 이름 문자열을 복사해 저장하면 과거 기록이 안전하다.

```ts
// ---------- 카테고리 ----------
export interface CategoryRecord {
  id: ID;                     // 프리셋은 presetKey와 동일한 값, 사용자 생성은 uuidv7()
  presetKey?: string;         // 프리셋 원본 대조 키. 사용자 생성 카테고리는 undefined
  type: TxType;
  name: string;
  colorHex: string;           // '#FFD9A0'
  iconPath: string;           // SVG path의 'd' 속성 문자열
  subs: string[];             // 세부항목
  visibleOnHome: boolean;     // 홈 그리드 노출 (기본 12개만 true)
  sortOrder: number;
  archived: boolean;          // 삭제 대신. 과거 기록의 참조를 지키기 위해 실제 삭제는 하지 않음
  deprecated?: boolean;       // 앱 업데이트로 프리셋 카탈로그에서 빠짐
  customizedFields: string[]; // 사용자가 직접 고친 필드 이름들
  createdAt: Epoch;
  updatedAt: Epoch;
}
```

**프리셋의 `id`를 `presetKey`와 같게 두는 이유:** 모든 기기에서 '식비'가 같은 id를 갖는다. 나중에 다기기 동기화를 붙일 때 프리셋 카테고리가 30개씩 중복 생성되는 사고를 원천 차단한다.

**카테고리는 절대 하드 삭제하지 않는다.** `archived: true`로만 처리한다. 지운 카테고리를 참조하는 과거 기록이 "알 수 없는 카테고리"가 되면 그건 데이터 유실이다.

```ts
// ---------- 결제수단 ----------
export type PaymentKind = 'cash' | 'credit' | 'debit';

export interface PaymentMethodRecord {
  id: ID;
  kind: PaymentKind;
  name: string;               // '현대카드'
  tag?: string;               // '현' — 칩에 표시되는 한 글자
  colorHex: string;
  accountId?: ID;             // 체크카드/현금 → 출금 계좌 연결 (선택)

  // 신용카드 전용
  paymentDay?: number;        // 결제일 1~28
  statementStartDay?: number; // 사용기간 시작일 — ※ 10장 미확정 항목 참조
  statementEndDay?: number;   // 사용기간 종료일
  performanceThreshold?: Minor; // 전월실적 기준 금액

  sortOrder: number;
  archived: boolean;
  createdAt: Epoch;
  updatedAt: Epoch;
}

// ---------- 자산/계좌 ----------
export interface AccountRecord {
  id: ID;
  name: string;
  kind: 'cash' | 'checking' | 'savings' | 'investment' | 'other';
  balance: Minor;             // 사용자가 직접 입력한 스냅샷 (은행 연동 없음)
  balanceAsOf: DateStr;       // 그 잔액이 사실이었던 날
  sortOrder: number;
  archived: boolean;
  createdAt: Epoch;
  updatedAt: Epoch;
}
```

**`accounts.balance`를 지출로 자동 차감하지 않는다.** 은행 API 연동이 없으므로 자동 차감은 반드시 실제 잔액과 어긋난다. 어긋난 숫자를 자신 있게 보여주는 게 제일 나쁘다. `balance` + `balanceAsOf`를 사용자 입력 스냅샷으로 두고, 화면에는 "8/1 기준 1,200,000원 · 이후 지출 340,000원"처럼 **파생값을 따로** 보여준다.

```ts
// ---------- 예산 ----------
export interface BudgetRecord {
  id: ID;
  period: 'month' | 'week';
  scope: 'total' | 'category';
  categoryId: ID | '*';       // total이면 '*' 센티널
  periodStart: DateStr;       // 경계를 '해석'하지 않고 저장한다
  periodEnd: DateStr;         // 포함(inclusive)
  amount: Minor;
  createdAt: Epoch;
  updatedAt: Epoch;
}
```

**예산에 `periodStart`/`periodEnd`를 명시 저장하는 이유:** 사용자가 `monthStartDay`를 1일→25일로 바꾸면, 기간 키('2026-08')만 저장했을 경우 **과거 예산의 의미가 소급해서 바뀐다.** 8월 예산 대비 실적이 어제와 다른 숫자로 보이는 건 신뢰를 깨는 버그다.

`categoryId`에 `undefined` 대신 `'*'`를 쓰는 건 IndexedDB 특성 때문이다. 복합 인덱스는 구성 요소 중 하나라도 없으면 **그 레코드를 인덱싱하지 않는다.** `undefined`면 total 예산에는 유니크 제약이 안 걸려서 중복 생성이 가능해진다.

```ts
// ---------- 예산 알림 (멱등성) ----------
export interface BudgetAlertRecord {
  id: ID;
  budgetId: ID;
  threshold: number;          // 0.8 | 1.0
  firedAt: Epoch;
}
```

`&[budgetId+threshold]` 유니크 제약이 **"80% 알림은 기간당 정확히 한 번"** 을 보장한다. 이게 없으면 지출을 넣을 때마다 80%를 넘은 상태이므로 알림이 계속 뜬다. 삽입이 `ConstraintError`로 실패하면 이미 알린 것이므로 조용히 무시한다.

```ts
// ---------- 반복 지출 ----------
export interface RecurringRuleRecord {
  id: ID;
  name: string;
  amount: Minor;
  type: TxType;
  categoryId: ID;
  subLabel?: string;
  paymentMethodId: ID;
  memo?: string;

  interval: 'weekly' | 'monthly' | 'yearly';
  dayOfMonth?: number;        // monthly/yearly: 1~28 (말일 처리는 clamp)
  weekday?: number;           // weekly: 0(일)~6(토)
  monthOfYear?: number;       // yearly: 1~12

  startDate: DateStr;
  endDate?: DateStr;
  nextRunDate: DateStr;
  lastRunDate?: DateStr;

  mode: 'auto' | 'remind';    // 자동 기록 vs 알림만
  active: boolean;
  createdAt: Epoch;
  updatedAt: Epoch;
}
```

**반복 지출 멱등성이 이 앱에서 제일 중요한 동시성 문제다.** 앱을 하루에 5번 열면 catch-up 로직이 5번 돈다. `expenses`의 `&[recurringRuleId+occurrenceDate]` 유니크 복합 인덱스가 이걸 DB 레벨에서 막는다:

```ts
async function materialize(rule: RecurringRuleRecord, occurrenceDate: DateStr) {
  try {
    await db.expenses.add({
      id: uuidv7(),
      date: occurrenceDate,
      time: '09:00',
      amount: rule.amount,
      type: rule.type,
      categoryId: rule.categoryId,
      subLabel: rule.subLabel,
      paymentMethodId: rule.paymentMethodId,
      memo: rule.memo,
      recurringRuleId: rule.id,
      occurrenceDate,             // ← 이 조합이 유니크
      createdAt: now(),
      updatedAt: now(),
    });
  } catch (e) {
    if ((e as Error).name === 'ConstraintError') return; // 이미 생성됨. 정상 경로.
    throw e;
  }
}
```

수동 입력 기록은 `recurringRuleId`가 `undefined`라 이 인덱스에 아예 들어가지 않는다 → 유니크 제약이 자동 생성분에만 적용된다.

```ts
// ---------- 설정 (단일 행) ----------
export interface SettingsRecord {
  id: 'app';
  monthStartDay: number;      // 1~28 (29~31은 2월에 정의 불가 → 제약)
  weekStartDay: number;       // 0(일)~6(토)
  defaultPaymentMethodId?: ID;
  baseCurrency: 'KRW';
  reminderEnabled: boolean;
  reminderTime?: TimeStr;
  themeMode: 'light' | 'dark' | 'system';
  budgetAlertThresholds: number[]; // [0.8, 1.0]
  updatedAt: Epoch;
}

// ---------- 툼스톤 (삭제 기록) ----------
export interface TombstoneRecord {
  id: ID;                     // 삭제된 레코드의 id를 그대로 씀
  table: string;
  deletedAt: Epoch;
  payload?: unknown;          // 휴지통/실행취소용 원본 스냅샷 (30일 후 제거)
}

// ---------- 메타 (key-value) ----------
export interface MetaRecord {
  key: 'deviceId' | 'presetVersion' | 'installedAt' | 'lastBackupAt' | 'lastBackupReminderAt';
  value: unknown;
  updatedAt: Epoch;
}
```

**툼스톤을 쓰고 `deletedAt` 컬럼을 안 쓰는 이유:** `deletedAt`을 두면 달력·월합계·예산 등 **모든** 조회에 `.filter(r => !r.deletedAt)`가 붙는다. 한 번만 빼먹어도 지운 지출이 합계에 들어가는 조용한 버그가 난다. 하드 삭제 + 별도 툼스톤이면 핫 경로 쿼리에 필터가 아예 필요 없다.

```ts
export async function softDelete(table: string, id: ID, row: unknown) {
  await db.transaction('rw', db.expenses, db.tombstones, async () => {
    await (db as any)[table].delete(id);
    await db.tombstones.put({ id, table, deletedAt: now(), payload: row });
  });
}
```

정리 주기: `payload`는 30일 후 제거(휴지통 만료), 툼스톤 행 자체는 **최소 180일 보관**한다. 클라우드 백업/동기화가 붙었을 때 마지막 동기화보다 오래된 툼스톤을 지우면 삭제가 되살아난다.

---

## 4. 조회 패턴별 구현

### 4-1. 달력: 한 달 일별 합계 31칸 (핫 경로)

```ts
// src/db/queries.ts
export interface DayTotals { expense: Minor; income: Minor; count: number }

export async function loadMonth(from: DateStr, to: DateStr): Promise<ExpenseRecord[]> {
  return db.expenses.where('date').between(from, to, true, true).toArray();
}

export function groupByDate(rows: ExpenseRecord[]): Map<DateStr, DayTotals> {
  const m = new Map<DateStr, DayTotals>();
  for (const r of rows) {
    let d = m.get(r.date);
    if (!d) { d = { expense: 0 as Minor, income: 0 as Minor, count: 0 }; m.set(r.date, d); }
    if (r.type === 'expense') (d.expense as number) += r.amount;
    else (d.income as number) += r.amount;
    d.count++;
  }
  return m;
}
```

React 쪽:

```ts
const rows = useLiveQuery(() => loadMonth(from, to), [from, to], undefined);
const totals = useMemo(() => (rows ? groupByDate(rows) : new Map()), [rows]);
```

`useLiveQuery`는 `expenses`에 쓰기가 생기면 재실행된다. 재실행 비용 = 300행 인덱스 레인지 스캔 = 수 ms. 매 렌더가 아니라 **매 쓰기**에만 발생한다.

### 4-2. 특정 날짜 기록 목록

```ts
export async function listByDate(date: DateStr) {
  const rows = await db.expenses.where('date').equals(date).toArray();
  return rows.sort((a, b) => (a.time < b.time ? 1 : -1)); // 최신순
}
```

인메모리 정렬을 쓰는 이유: 하루 기록은 많아야 수십 건이다. `[date+time]` 복합 인덱스를 하나 더 유지할 값이 없다.

### 4-3. 월/주차 경계 (설정 반영)

```ts
/** monthStartDay=25면 '2026-08' 회계월은 2026-07-25 ~ 2026-08-24 */
export function monthRange(year: number, month1to12: number, monthStartDay: number) {
  const d = monthStartDay;
  const start = new Date(year, month1to12 - 1, d);
  const end = new Date(year, month1to12, d);
  end.setDate(end.getDate() - 1);
  return { from: fmt(start), to: fmt(end) };
}

/** 로컬 타임존 기준 'YYYY-MM-DD'. toISOString()은 UTC라 하루가 밀린다. */
export function fmt(d: Date): DateStr {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
```

`fmt()`에서 `toISOString().slice(0,10)`을 **절대 쓰지 않는다.** KST(UTC+9)에서 자정 직후 기록이 전날로 밀린다. 이 앱에서 가장 나기 쉬운 날짜 버그다.

`monthStartDay`를 1~28로 제한한 것도 같은 종류의 방어다. 31일 시작을 허용하면 2월 경계가 정의되지 않는다.

### 4-4. 카드별 이번 달 결제액 / 미결제 잔액

**`paid` / `unpaid` 플래그를 저장하지 않는다.** 이건 `date` + 카드의 사용기간·결제일로 100% 파생되는 값이다. 저장하면 날짜를 수정했을 때 조용히 낡는다. 조회 시점에 계산한다.

전월실적(`performanceThreshold`) 진행률도 같은 방식으로 전월 범위 합계를 그때 구한다. 둘 다 `date` 인덱스 레인지 스캔 한 번이다.

---

## 5. 집계 전략: 롤업 테이블을 만들지 않는다

**결론: 만들지 않는다. 매번 스캔한다.**

| 지표 | 값 |
|---|---|
| 연간 기록 수 | 개인용 최대 3,000~4,000행 |
| 월 조회 행 수 | 200~300행 |
| 300행 레인지 스캔 + reduce | 수 ms |
| 재계산 시점 | 렌더마다가 아니라 **쓰기마다** (`useLiveQuery`) |

롤업 테이블(`dailyTotals`)을 만들면 얻는 건 몇 ms고, 잃는 건 **정합성 책임 전체**다. 지출 수정/삭제/날짜 변경/반복지출 자동생성/백업 복원 — 이 모든 경로에서 롤업을 트랜잭션 안에서 정확히 증감시켜야 한다. 한 군데만 빠지면 달력 숫자가 틀린다. 그리고 **가계부에서 틀린 합계는 앱을 버릴 이유가 된다.**

**도입 조건. 아래 중 하나라도 실측되면 그때 만든다:**

1. 월 조회 행 수가 500행을 상시 초과
2. "전 기간 통계 / 연도별 차트" 화면이 추가되어 수천 행 풀스캔이 렌더 경로에 들어옴
3. 실제 기기(저사양 Android)에서 달력 렌더 프레임 드랍이 **측정으로** 확인됨

도입할 때의 설계 스케치: `dailyTotals { date /*PK*/, expense, income, count, dirty: boolean }`. 증분 갱신 대신 **`dirty` 플래그 + 해당 날짜만 재계산**으로 간다. 증분 산술은 어긋나면 복구가 안 되지만, 재계산은 언제든 원본에서 진실을 다시 만들 수 있다.

---

## 6. 프리셋 시딩과 마이그레이션

### 6-1. 두 개의 버전 축을 분리한다

| 축 | 저장 위치 | 언제 올리나 |
|---|---|---|
| **스키마 버전** | Dexie `version(n)` | 테이블/인덱스 구조가 바뀔 때만 |
| **프리셋 버전** | `meta.presetVersion` | 프리셋 카테고리 내용이 바뀔 때 |

**이걸 섞으면 안 된다.** Dexie의 `upgrade()` 콜백은 스키마 버전이 바뀔 때만 실행된다. 프리셋 카테고리 이름/색상만 고친 릴리스에서는 스키마가 그대로라 `upgrade()`가 영영 안 돈다. 프리셋 반영은 **앱 부팅 시 별도 조정(reconcile) 단계**여야 한다.

비인덱스 컬럼 추가에는 스키마 버전업이 **필요 없다.** IndexedDB는 레코드 단위 스키마리스다.

### 6-2. 프리셋: 상수가 원본, DB는 사용자 사본

`key`는 **한 번 배포되면 절대 변경 금지**다. `id`로도 쓰이므로 바꾸면 기존 기록의 참조가 끊긴다. 코드 리뷰 시 이 배열의 `key` 변경은 무조건 반려한다.

### 6-3. 조정 규칙 (앱 업데이트로 프리셋이 바뀌었을 때)

```ts
export async function reconcilePresets() {
  const meta = await db.meta.get('presetVersion');
  const applied = (meta?.value as number) ?? 0;
  if (applied >= PRESET_VERSION) return;

  await db.transaction('rw', db.categories, db.meta, async () => {
    const existing = await db.categories.toArray();
    const byKey = new Map(existing.filter(c => c.presetKey).map(c => [c.presetKey!, c]));
    const presetKeys = new Set(PRESET_CATEGORIES.map(p => p.key));

    for (const p of PRESET_CATEGORIES) {
      const cur = byKey.get(p.key);

      // (1) 신규 프리셋 → 삽입
      if (!cur) {
        await db.categories.add({
          id: p.key, presetKey: p.key, type: p.type, name: p.name,
          colorHex: p.colorHex, iconPath: p.iconPath, subs: [...p.subs],
          visibleOnHome: p.defaultVisibleOnHome, sortOrder: p.defaultSortOrder,
          archived: false, customizedFields: [],
          createdAt: now(), updatedAt: now(),
        });
        continue;
      }

      // (2) 기존 프리셋 → 사용자가 안 건드린 필드만 갱신
      const c = new Set(cur.customizedFields);
      const patch: Partial<CategoryRecord> = { deprecated: false };
      if (!c.has('name'))     patch.name = p.name;
      if (!c.has('colorHex')) patch.colorHex = p.colorHex;
      if (!c.has('type'))     patch.type = p.type;
      patch.iconPath = p.iconPath;  // 아이콘은 항상 갱신 (SVG 리터치는 사용자 의도와 무관)

      // (3) 세부항목: 추가만. 사용자가 지운 걸 되살리지 않는다.
      if (!c.has('subs')) {
        const add = p.subs.filter(s => !cur.subs.includes(s));
        if (add.length) patch.subs = [...cur.subs, ...add];
      }

      patch.updatedAt = now();
      await db.categories.update(cur.id, patch);
    }

    // (4) 카탈로그에서 빠진 프리셋 → 절대 삭제하지 않는다
    for (const c of existing) {
      if (c.presetKey && !presetKeys.has(c.presetKey) && !c.deprecated) {
        await db.categories.update(c.id, { deprecated: true, updatedAt: now() });
      }
    }

    await db.meta.put({ key: 'presetVersion', value: PRESET_VERSION, updatedAt: now() });
  });
}
```

핵심 규칙 4가지:

1. **신규 프리셋은 추가한다.**
2. **사용자가 고친 필드는 건드리지 않는다.** `customizedFields`가 필드 단위라, "이름만 바꾼 사용자"도 색상 리뉴얼은 받는다.
3. **세부항목은 append만.** 사용자가 지운 항목을 업데이트가 되살리면 명백히 짜증나는 동작이다.
4. **프리셋 제거 = 삭제가 아니라 `deprecated` 표시.**

카테고리 편집 UI는 저장 시 바뀐 필드를 `customizedFields`에 넣어야 한다. 이걸 빠뜨리면 업데이트가 사용자 설정을 덮어쓴다 — **UI 쪽에 반드시 전달할 계약이다.**

### 6-4. 마이그레이션 규칙

- **upgrader가 붙은 `version()` 블록은 절대 수정하지 않는다.** 변경은 항상 새 버전 추가로.
- upgrade는 **가산적(additive)으로만** 쓴다. 컬럼 삭제/파괴적 변환 대신 새 컬럼을 채운다.
- 파괴적 변환이 불가피하면, upgrade 시작 전에 **전체 JSON 백업을 자동 export**하고 진행한다.
- 실패 시 Dexie가 트랜잭션 전체를 롤백하지만, 롤백된 상태로 앱이 열리므로 **사용자에게 실패를 알려야 한다.**

### 6-5. PWA autoUpdate + Dexie 버전 충돌 (실제로 터지는 문제)

`vite.config.ts`가 `registerType: 'autoUpdate'`다. 즉 새 서비스워커가 자동 활성화되고, **구버전 탭이 열려 있는 상태에서 신버전 탭이 열릴 수 있다.**

```ts
db.on('versionchange', () => {
  db.close();
  showReloadPrompt('앱이 업데이트되었습니다. 새로고침해 주세요.');
});

db.on('blocked', () => {
  showReloadPrompt('다른 탭에서 앱이 열려 있습니다. 모두 닫고 새로고침해 주세요.');
});

db.open().catch((e) => {
  if (e.name === 'VersionError') {
    showReloadPrompt('앱 버전이 맞지 않습니다. 새로고침해 주세요.');
  } else {
    reportFatal(e); // 절대 조용히 실패하지 않는다
  }
});
```

---

## 7. 백업/복원 + CSV — 단계별

백업은 확정 기능이고 "기기를 바꿔도 살아남아야 한다"가 요구사항이다. 그런데 **로컬 파일 내보내기 단독으로는 이 요구사항을 못 지킨다.** 사용자가 직접 누르지 않으면 백업이 없기 때문이다.

### 7-0. 먼저 알아야 할 플랫폼 제약

**Capacitor로 감싸면 기존 PWA 사용자의 데이터가 넘어가지 않는다.**

- TWA는 Chrome이 해당 origin을 렌더링하므로 브라우저와 저장소를 공유한다.
- **Capacitor는 앱 전용 WebView라 저장소가 완전히 별개다.** 웹으로 쓰던 사용자가 Play Store 앱을 설치하면 빈 DB를 본다.

또한 Capacitor 문서는 WebView 저장소를 **"transient(휘발 가능)"으로 간주하고, 기기 저장공간이 부족하면 OS가 회수할 수 있다**고 명시한다.

대응:
1. 첫 저장 성공 직후 `navigator.storage.persist()`를 호출한다.
2. 웹 → 앱 전환 시점에 웹 버전에 **"앱으로 옮기기: 백업 파일 내보내기"** 안내를 띄운다. 자동 이관은 불가능하므로 UX로 푼다.
3. Play Store 출시 전이라면, 웹 배포를 최소한으로 하고 처음부터 Capacitor로 가는 것도 선택지다.

### 7-1. 1단계 (MVP, 서버 없음) — 반드시 포함

**A. 수동 파일 내보내기/가져오기**

File System Access API(`showSaveFilePicker`)는 **Chrome for Android에서 지원되지 않는다.** Android 우선 앱이므로 이 API에 의존하면 안 된다.

- **내보내기**: `Blob` → `URL.createObjectURL` → `<a download>` 클릭.
- **공유**: Android에서는 `navigator.share({ files })`가 더 좋은 UX다. `navigator.canShare({ files })`로 feature detect 후 fallback.
- **가져오기**: `<input type="file" accept="application/json">`.

```ts
export interface BackupFile {
  formatVersion: 1;            // 백업 포맷 버전 (스키마 버전과 별개)
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;          // ISO8601
  deviceId: string;
  counts: Record<string, number>;  // 복원 전 검증용
  data: { /* 테이블별 배열 */ };
  // entitlement / budgetAlerts 는 의도적으로 제외 — 8장 참조
}
```

복원 규칙:

1. **MVP는 "전체 교체(replace)"만 제공한다.**
2. 복원 전 **현재 데이터를 자동으로 한 번 내보낸다.** 잘못된 파일로 3년치를 날리는 사고를 막는 마지막 방어선이다.
3. `formatVersion`을 먼저 검사하고, 미래 버전이면 거부한다.
4. 백업 파일은 **사용자가 편집할 수 있는 외부 입력**이다. Zod로 파싱 후 통과분만 쓴다.
5. 전체를 **단일 Dexie 트랜잭션**에서 clear → `bulkPut`.

**B. 백업 리마인더**

`meta.lastBackupAt`을 기록하고, 14일 이상 지났으면 설정 탭에 배지를 띄운다.

**C. Android Auto Backup (Capacitor 단계에서)**

Android는 앱 내부 저장소와 database 디렉터리를 사용자 Google Drive에 자동 백업하고 기기 교체 시 복원한다. 앱당 25MB, 사용자 Drive 할당량을 소모하지 않는다.

**다만 이건 검증 없이 의존하면 안 된다.** Chromium이 일부 데이터를 캐시 디렉터리에 두면 제외된다.

```bash
adb shell bmgr backupnow <package>
adb uninstall <package>
adb install app.apk   # 재설치 후 데이터가 살아있는지 확인
```

확인되면 `data_extraction_rules.xml`에 `app_webview` 포함을 명시하고, 확인 안 되면 이 항목은 계획에서 뺀다.

### 7-2. 2단계 (계정 기반 클라우드 백업) — Pro 출시 이후

**동기화가 아니라 "암호화된 스냅샷 백업"으로 간다.**

| | 행 단위 동기화 | 암호화 스냅샷 백업 (권장) |
|---|---|---|
| 서버 스키마 | 전 테이블 미러 + RLS | `backups(user_id, blob, updated_at)` 한 개 |
| 충돌 해결 | 테이블마다 LWW 구현·테스트 | 없음 (최신 스냅샷이 이김) |
| 서버가 보는 것 | **모든 지출 내역 평문** | 암호문 바이트뿐 |
| 유출 시 피해 | 전 사용자 재무 기록 | 없음(키가 서버에 없음) |
| 구현 규모 | 수 주 | 며칠 |
| 다기기 실시간 | 가능 | 불가 (수동/주기적 복원) |

개인 가계부에서 다기기 실시간 동기화는 요구되지 않았다. **"기기를 바꿔도 살아남는다"는 스냅샷으로 충분히 충족된다.**

구성:

- **Supabase**: Auth(Google 로그인) + Storage 1개 버킷. 무료 티어로 충분.
- **E2E 암호화**: 사용자 복구 비밀번호 → `PBKDF2`(또는 Argon2id) → AES-GCM 키. `crypto.subtle`로 브라우저 내 처리. **키는 절대 서버로 보내지 않는다.**
- Storage 경로 `backups/{user_id}/latest.enc` + RLS로 `auth.uid() = owner`만 접근.
- **버전 보관**: 최근 3개(`latest`, `prev-1`, `prev-2`) 로테이션.

**반드시 UI에 명시할 것:** "비밀번호를 잊으면 백업을 복구할 수 없습니다."

**개인정보 관점:**
- 서버 저장 개인정보 = 이메일(Auth) + 암호문 blob.
- Play Data safety 양식에는 "금융 정보 수집" 여부를 정직하게 신고한다.
- 계정 삭제 시 Storage 객체까지 삭제하는 경로를 만든다 — **Play Store 정책 요구사항.**
- 광고 SDK(AdMob)에 **지출 데이터를 절대 전달하지 않는다.**

### 7-3. CSV 내보내기

CSV는 **내보내기 전용**이다. 백업 복원 경로로 쓰지 않는다.

```ts
const CSV_HEADERS = ['날짜','시간','구분','금액','카테고리','세부항목','결제수단','메모'] as const;

function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  // CSV 인젝션 방지: 엑셀이 수식으로 해석하는 선두 문자 무력화
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}
```

세 가지가 실무에서 중요하다:

1. **UTF-8 BOM(`﻿`).** 없으면 한국 사용자 대부분(Windows 엑셀)에서 한글이 깨진다.
2. **CSV 인젝션 방어.** 메모에 `=HYPERLINK(...)`를 넣고 그 CSV를 남에게 보내면 엑셀에서 실행된다.
3. **금액은 raw 정수로.** 천 단위 콤마를 넣으면 엑셀이 텍스트로 읽어 SUM이 안 된다.

---

## 8. Pro 엔타이틀먼트 — 현재 스코프 제외 (보류)

> **이 장은 지금 구현하지 않는다.** 수익화는 광고 단일 티어로 간다.
> 아래 내용은 나중에 Pro를 도입할 때 다시 꺼내 쓰기 위한 기록이며, 특히 8-2의
> "백업 파일 편집으로 Pro 획득" 문제는 도입 시점에 반드시 먼저 해결해야 한다.
>
> 지금 당장 지켜야 할 것은 하나뿐이다 — **백업 export 대상 테이블을 allowlist로 관리한다.**
> 그래야 나중에 엔타이틀먼트 저장소가 생겨도 실수로 백업에 끼지 않는다.

### 8-1. 서버 영수증 검증은 하지 않는다

- 상품은 **광고 제거** 하나다.
- 우회에 성공한 공격자가 얻는 것 = 광고 미노출. **손실은 그 사용자 1명의 광고 수익이다.**
- 우회하려면 루팅 + 앱 패치 + Play Billing 후킹이 필요하다. 이만큼 하는 사용자는 애초에 결제하지 않았을 사용자다.
- 반면 서버 검증에는 Google Play Developer API 서비스 계정, 백엔드, RTDN 웹훅, 그 백엔드의 가용성·보안 유지가 필요하다.

**Play Billing의 `queryPurchasesAsync()`만으로 충분하다.** 엔타이틀먼트는 Google 계정에 묶여 기기 교체·재설치를 자동으로 따라온다.

**재검토 조건:** (a) 구독으로 월 매출이 유의미해지거나, (b) 서버 기능(2단계 클라우드 백업)이 Pro 전용이 될 때. (b)의 경우 **서버 리소스를 소비하는 기능은 서버가 권한을 확인해야 한다.**

### 8-2. 저장 위치 — 메인 DB 밖, 백업 대상 제외

백업 JSON은 사용자가 텍스트 편집기로 열 수 있다. 엔타이틀먼트를 Dexie 메인 DB에 넣으면:

```
백업 내보내기 → JSON에서 "isPro": false → true → 복원 → Pro 획득
```

루팅도 필요 없는 30초짜리 우회다. 따라서:

1. 엔타이틀먼트를 `AppDB` **밖**에 둔다.
2. 백업/복원 대상 테이블 목록에 **포함하지 않는다** (allowlist 방식).
3. 저장은 Capacitor Preferences(네이티브 SharedPreferences)에 둔다. 웹 빌드는 `localStorage`.

```ts
export interface Entitlement {
  isPro: boolean;
  productId?: string;
  purchaseToken?: string;
  verifiedAt: Epoch;
  source: 'play' | 'grace';
}

const GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export function isProUsable(e: Entitlement | null): boolean {
  if (!e?.isPro) return false;
  return Date.now() - e.verifiedAt < GRACE_MS;   // 오프라인 유예 7일
}
```

- **Play Billing이 진실의 원본이다.** 로컬 저장은 오프라인 유예용 캐시일 뿐이다.
- 앱 시작 시(그리고 포그라운드 복귀 시) `queryPurchasesAsync()`로 갱신한다.
- 오프라인이면 캐시로 최대 7일 유지. 비행기 모드로 영구 Pro가 되는 것도, 지하철에서 광고가 튀어나오는 것도 막는다.
- **실패 시 기본값은 무료(광고 표시)다.**

### 8-3. 웹 빌드

Play Billing은 네이티브에서만 동작한다. **웹에서는 Pro 구매 UI를 숨기고 무료 티어로만 동작**시킨다.

---

## 9. 동기화 대비: 지금 확정하는 필드

기준은 하나다 — **"나중에 추가하면 되는가?"** 답이 예면 지금 안 넣는다.

### 9-1. 지금 넣는다 (나중이면 늦음)

| 필드 | 대상 | 왜 지금이어야 하나 |
|---|---|---|
| `id: string` (UUIDv7) | 전 테이블 | **가장 되돌리기 어렵다.** `++id`는 기기 간 충돌하고, 나중에 바꾸려면 모든 FK를 다시 쓰는 마이그레이션이 필요 |
| `createdAt: Epoch` | 전 테이블 | 소급 생성이 불가능하다 |
| `updatedAt: Epoch` + 인덱스 | 변경 가능한 전 테이블 | 델타 동기화와 병합 복원의 LWW 기준 |
| `tombstones` 테이블 | 전역 | **삭제 기록이 없으면 삭제를 동기화할 수 없다** |
| `type` 스냅샷 | `expenses` | 카테고리 변경이 과거 기록을 뒤집는 것을 막는다 |
| `subLabel` 이름 스냅샷 | `expenses` | 같은 이유 |
| `periodStart`/`periodEnd` | `budgets` | 설정 변경이 과거 예산 경계를 재해석하는 것을 막는다 |
| `presetKey` = `id` | `categories` | 기기 간 프리셋 중복 생성 원천 차단 |
| `deviceId` | `meta` (1행) | 충돌 원인 추적 |
| `Minor` 정수 금액 | 전역 | float으로 한 번 저장되면 오차 복구 불가 |

### 9-2. 지금 넣지 않는다 (나중에 쉽다)

| 항목 | 이유 |
|---|---|
| 행별 `userId` | 다계정이 생기면 컬럼 추가보다 **계정별 Dexie DB 분리**가 깨끗하다 |
| 행별 `schemaVersion` | 순수 낭비. `meta` 1행 + 백업 헤더면 충분 |
| 행별 `deletedAt` | 툼스톤으로 대체 |
| `rev` / 벡터 클럭 / CRDT | 단일 사용자 다기기에서 동시 편집 충돌은 극히 드물다. `updatedAt` LWW로 충분 |
| `syncState` / `dirty` | 비인덱스 컬럼 추가는 스키마 버전업도 필요 없다 |
| 행별 `currency` | 2-2 참조 |
| `lastSyncedAt` | 동기화 붙일 때 `meta`에 한 줄 |

### 9-3. 확정 사항 한 줄 요약

> 모든 행에 **UUIDv7 `id`**, **`createdAt`**, **`updatedAt`(인덱스)** 을 넣는다. 삭제는 **툼스톤**으로 남긴다. 과거 기록의 의미를 바꾸는 참조는 **스냅샷으로 비정규화**한다. 그 외 동기화 관련 필드는 넣지 않는다.

---

## 10. 확인이 필요한 미확정 항목

### 확정됨

1. ~~**신용카드 명세 주기.**~~ → **(a) 사용자가 카드 등록 시 사용기간을 직접 입력한다.**
   카드 등록 화면에서 `사용기간 시작일` / `사용기간 종료일` / `결제일`을 각각 받는다.
   `statementStartDay` / `statementEndDay`는 `kind === 'credit'`일 때 **필수 입력**으로 다룬다.
   입력 부담을 줄이기 위해 결제일을 고르면 관례값(예: 결제일 −45일 ~ −15일)을 **기본값으로 채워주되
   사용자가 수정할 수 있게** 한다. 자동 역산을 최종 진실로 쓰지는 않는다.

2. ~~**Pro 상품 형태 / 혜택 범위.**~~ → **현재 스코프 제외.** 광고 단일 티어로 간다. 8장 참조.

### 미확정

3. **전월실적 산정 범위.** 카드사마다 실적 제외 항목(세금, 상품권, 할부 등)이 다르다. 단순 합계로 보여줄지, "참고값" 면책을 붙일지.

4. **`accounts.balance` 자동 차감 여부.** 위에서는 자동 차감하지 않는 안을 제안했다.

5. **Android Auto Backup이 WebView IndexedDB를 실제로 포함하는지.** 7-1 C의 `adb bmgr` 절차로 검증 전까지 백업 수단으로 계산하지 않는다.

6. **포장 방식(TWA + AdSense vs Capacitor + AdMob).** 광고 SDK 선택과 묶여 있다. `design-brief.md` 6장 참조. 결론 전까지 웹 버전을 공개 배포하지 않는다.

---

## 11. 구현 시 검증 체크리스트

`fake-indexeddb`로 실제 Dexie 인스턴스를 돌린다 — **mock으로 대체하지 않는다.** 마이그레이션 버그는 mock에서 절대 안 잡힌다.

**정합성**
- [ ] `monthStartDay`가 25일일 때 월 경계가 전월 25일~당월 24일로 계산됨
- [ ] 23:50 기록이 다음 날로 밀리지 않음 (`toISOString` 미사용 회귀 테스트)
- [x] 윤년 2/29, 월말(31일→2월) 반복 지출 clamp — 2026-08-03 수동 검증. 1/31 매월 시작 규칙이 1/31→2/28→3/31→4/30→5/31→6/30→7/31로 정확히 클램프됨 (자동화 테스트 아님, 브라우저에서 직접 확인)
- [ ] 카테고리를 archive해도 과거 기록 표시가 깨지지 않음
- [ ] 카테고리 `type`을 바꿔도 과거 기록의 지출/입금이 안 바뀜

**동시성 / 멱등성**
- [x] 같은 반복 규칙 materialize를 연속 3회 호출 → 기록 1건만 생성 — 2026-08-03 수동 검증. 규칙을 변경 없이 재수정해 nextRunDate를 startDate로 되돌린 뒤 재실행해도 `&[recurringRuleId+occurrenceDate]` 유니크 인덱스가 중복을 막음 (자동화 테스트 아님)
- [ ] 예산 80% 알림이 지출 10건 추가 후에도 1회만 발생
- [ ] "추가!" 버튼 연타 시 중복 저장 방지 — UI 디바운스 + 저장 중 disable

**마이그레이션**
- [ ] v1 데이터가 든 DB를 v2 코드로 열어 데이터 보존 확인
- [ ] `presetVersion` 올린 뒤 사용자가 이름을 고친 카테고리가 덮어써지지 않음
- [ ] 사용자가 지운 세부항목이 업데이트로 부활하지 않음
- [ ] `VersionError` / `blocked` 이벤트에서 앱이 흰 화면으로 죽지 않음

**백업/복원**
- [ ] export → clear → import 후 모든 테이블 행 수와 합계가 일치
- [ ] 손상된 JSON, 잘린 JSON, 빈 파일로 복원 시도 → 기존 데이터 보존 + 명확한 에러
- [ ] 백업 JSON에 `isPro`를 손으로 넣고 복원 → **Pro가 되지 않음**
- [ ] 미래 `formatVersion` 파일 거부
- [ ] CSV를 한글 Windows 엑셀에서 열었을 때 한글 정상 + 금액 SUM 동작
- [ ] 메모에 `=1+1` 입력 후 CSV 내보내기 → 엑셀에서 수식으로 실행되지 않음

**Android 실기기**
- [ ] `navigator.storage.persist()` 승인 여부 확인
- [ ] `adb bmgr backupnow` → 삭제 → 재설치 후 데이터 생존 여부
- [ ] 오프라인 상태에서 Pro 유지, 7일 초과 시 무료 전환

---

## 참고 자료

- [Dexie — Version.stores() 스키마 문법](https://dexie.org/docs/Version/Version.stores())
- [Dexie — 데이터베이스 버저닝](https://dexie.org/docs/Tutorial/Design#database-versioning)
- [caniuse — File System Access API (Chrome for Android 미지원)](https://caniuse.com/native-filesystem-api)
- [Android Developers — Auto Backup for Apps](https://developer.android.com/identity/data/autobackup)
- [Android Developers — Google Play Billing 연동](https://developer.android.com/google/play/billing/integrate)
- [Capacitor — Storage (WebView 저장소는 휘발 가능)](https://capacitorjs.com/docs/guides/storage)
- [Chrome for Developers — Trusted Web Activity (Chrome과 저장소 공유)](https://developer.chrome.com/docs/android/trusted-web-activity)
