import { addMonthsClamped, fmt, fmtTime } from './date';
import { db, deleteWithTombstone } from './db';
import { now, uuidv7 } from './id';
import type { ExpenseRecord, ID } from './types';
import { toMinor } from './types';

const MIN_MONTHS = 2;

/** 두 자리까지 받는다. 칩으로 고르게 하다가 직접 입력으로 바꿨는데, 카드사마다
 *  거는 개월 수가 제각각이라(7·10·18·24개월 특별 할부) 몇 개를 골라 내놔도
 *  반드시 없는 것을 쓰는 사람이 나온다. 상한은 실제 한도라기보다 입력 자릿수다. */
const MAX_MONTHS = 99;

/** 개월 수 입력에 키패드 한 번을 적용한다.
 *
 *  금액용 applyKey와 따로 두는 이유는 자릿수 상한이 다르기 때문이다 — 금액은
 *  11자리인데 개월 수에 그걸 쓰면 "1200000개월 할부"를 칠 수 있다. */
export function applyMonthKey(current: string, key: string): string {
  if (key === 'del') return current.slice(0, -1);
  const next = (current + key).replace(/^0+/, '');
  return next.length > 2 ? current : next;
}

export class InstallmentRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InstallmentRangeError';
  }
}

/** 총액을 회차별 금액으로 나눈다. 합이 반드시 총액과 같다.
 *
 *  나머지는 **첫 회차**에 얹는다. 카드사 관례가 그렇기도 하고, 마지막에
 *  얹으면 몇 달 뒤에야 어긋난 금액이 나타나서 사용자가 앱을 의심한다.
 *  100만원을 3개월로 하면 333,334 / 333,333 / 333,333 이다.
 *
 *  나누어떨어지게 만들려고 총액을 반올림하지는 않는다. 총액은 사용자가 실제로
 *  결제한 금액이고, 그걸 바꾸면 카드 명세서와 안 맞는다. */
export function splitInstallment(total: number, months: number): number[] {
  if (!Number.isInteger(months) || months < MIN_MONTHS || months > MAX_MONTHS) {
    throw new InstallmentRangeError(`할부는 ${MIN_MONTHS}~${MAX_MONTHS}개월까지야`);
  }
  const amount = Math.round(total);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new InstallmentRangeError('할부 금액이 올바르지 않아');
  }
  /* 회차마다 최소 1원은 있어야 한다. 아니면 0원짜리 기록이 달력에 박히는데,
     사용자 눈에는 그냥 앱이 고장난 것으로 보인다. */
  if (amount < months) {
    throw new InstallmentRangeError(`${months}개월로 나누기엔 금액이 너무 적어`);
  }

  const base = Math.floor(amount / months);
  const remainder = amount - base * months;
  return Array.from({ length: months }, (_, i) => (i === 0 ? base + remainder : base));
}

export type NewInstallment = {
  /** 결제 총액. 회차 금액이 아니다. */
  total: number;
  months: number;
  categoryId: ID;
  subLabel?: string;
  paymentMethodId: ID;
  memo?: string;
  /** 구매 시점. 기본값은 지금. */
  at?: Date;
};

/** 회차 수만큼 지출 행을 만든다. 첫 회차가 구매일, 나머지는 매월 같은 날짜.
 *
 *  전부 한 트랜잭션에서 넣는다. 중간에 실패해 몇 회차만 남으면 달력에는
 *  기록이 보이는데 합계가 총액과 안 맞고, 사용자가 그걸 알아챌 방법이 없다. */
export async function addInstallment(input: NewInstallment): Promise<ID> {
  const at = input.at ?? new Date();
  const purchaseDate = fmt(at);
  const time = fmtTime(at);
  const parts = splitInstallment(input.total, input.months);

  const installmentId = uuidv7();
  const stamp = now();
  const total = toMinor(input.total);

  const rows: ExpenseRecord[] = parts.map((amount, i) => ({
    id: uuidv7(),
    /* 항상 구매일에서 다시 센다. 직전 회차 날짜에 한 달씩 더하면 1/31이
       2/28로 당겨진 뒤 3/28, 4/28로 굳어버린다. */
    date: addMonthsClamped(purchaseDate, i),
    time,
    amount: toMinor(amount),
    // 할부는 지출에만 있다. 카테고리가 입금이어도 여기서는 지출로 적는다.
    type: 'expense',
    categoryId: input.categoryId,
    subLabel: input.subLabel,
    paymentMethodId: input.paymentMethodId,
    memo: input.memo || undefined,
    installmentId,
    installmentNo: i + 1,
    installmentMonths: input.months,
    installmentTotal: total,
    createdAt: stamp,
    updatedAt: stamp,
  }));

  await db.transaction('rw', db.expenses, async () => {
    await db.expenses.bulkAdd(rows);
  });

  return installmentId;
}

export function isInstallment(r: ExpenseRecord): boolean {
  return r.installmentId !== undefined && (r.installmentMonths ?? 0) >= MIN_MONTHS;
}

/** "3개월 할부 2/3". 할부가 아니면 null. */
export function installmentLabel(r: ExpenseRecord): string | null {
  if (!isInstallment(r)) return null;
  return `${r.installmentMonths}개월 할부 ${r.installmentNo}/${r.installmentMonths}`;
}

/** 같은 결제에서 나온 회차 전부, 회차 순서대로.
 *
 *  installmentId에 인덱스가 없어서 전체 스캔이다. 의도한 것이다 — 인덱스를
 *  더하려면 Dexie 버전을 올려야 하고, 그건 이미 설치된 기기의 DB를 건드리는
 *  일이다. 이 함수는 화면을 그리는 경로가 아니라 사용자가 한 건을 지우거나
 *  열어볼 때만 돈다. 기록 수천 건에서 한 번 스캔하는 비용은 그 위험보다 싸다. */
export function listInstallmentGroup(installmentId: ID): Promise<ExpenseRecord[]> {
  return db.expenses
    .filter((r) => r.installmentId === installmentId)
    .toArray()
    .then((rows) => rows.sort((a, b) => (a.installmentNo ?? 0) - (b.installmentNo ?? 0)));
}

/** 할부 한 건을 통째로 지운다.
 *
 *  회차 하나만 지우는 길은 두지 않았다. 남은 회차의 합이 총액과 달라지는데,
 *  그 상태를 화면에 설명할 방법이 없다 — "3개월 할부 1/3"과 "3/3"만 남은
 *  달력은 사용자가 읽을 수 없다. 지우려면 결제 자체를 지우는 것이다.
 *
 *  회차마다 툼스톤이 남으므로 휴지통에서 되살릴 때도 회차가 보존된다. */
export async function deleteInstallmentGroup(installmentId: ID): Promise<number> {
  const rows = await listInstallmentGroup(installmentId);
  for (const r of rows) await deleteWithTombstone('expenses', r.id);
  return rows.length;
}
