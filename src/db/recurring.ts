import { db } from './db';
import { now, uuidv7 } from './id';
import type { ID, RecurringRuleRecord } from './types';
import { toMinor } from './types';

/** Saved expenses you fill the input screen with in one tap.
 *
 *  These used to run on a schedule — pick 매월 and a start date, and the app
 *  wrote the record for you on the day. That was dropped because the schedule
 *  was usually wrong: rent has a due date but gets paid a day or two either
 *  side of it, and an entry auto-filed on the wrong date is worse than no
 *  entry at all, since the user has to go find and correct it. A wrong record
 *  costs more than a missing one.
 *
 *  What is left is the part that was actually saving work: the amount, the
 *  category and the payment method, kept together under a name. Tapping one
 *  fills the input screen with all of it; saving is still the user's "추가!",
 *  for the same reason the schedule went — nothing writes a record on its
 *  own. */
export interface RecurringRuleInput {
  name: string;
  amount: number;
  categoryId: ID;
  subLabel?: string;
  paymentMethodId: ID;
  memo?: string;
}

/** 만들 수 있는 템플릿 수. 화면이 감당하는 양이 아니라 고르는 데 드는 시간을
 *  기준으로 잡았다 — 목록이 길어지면 찾는 게 직접 입력보다 느려지고, 그러면
 *  3초 안에 끝낸다는 전제가 깨진다. */
export const MAX_RECURRING_RULES = 10;

/** 상한에 걸렸다는 것과 저장이 실패했다는 것은 사용자가 할 일이 다르다.
 *  하나는 지우면 되고 하나는 다시 누르면 된다. */
export class RecurringLimitError extends Error {
  constructor() {
    super(`반복 지출은 ${MAX_RECURRING_RULES}개까지 만들 수 있어`);
    this.name = 'RecurringLimitError';
  }
}

/** 스케줄을 쓰던 시절 규칙에는 visibleOnHome이 없다. 마이그레이션 대신 읽는
 *  자리에서 기본값을 준다 — 이미 깔린 DB의 버전을 올릴 이유로는 약하다. */
export function isTemplateVisible(rule: RecurringRuleRecord): boolean {
  return rule.visibleOnHome ?? true;
}

export async function addRecurringRule(input: RecurringRuleInput): Promise<void> {
  if ((await db.recurringRules.count()) >= MAX_RECURRING_RULES) throw new RecurringLimitError();

  const stamp = now();
  await db.recurringRules.add({
    id: uuidv7(),
    name: input.name.trim(),
    amount: toMinor(input.amount),
    type: 'expense',
    categoryId: input.categoryId,
    subLabel: input.subLabel,
    paymentMethodId: input.paymentMethodId,
    memo: input.memo?.trim() || undefined,
    /* 방금 만들었으면 쓰려고 만든 것이다. 켜러 한 번 더 들어가게 하지 않는다. */
    visibleOnHome: true,
    createdAt: stamp,
    updatedAt: stamp,
  });
}

export async function setRecurringVisible(id: ID, visible: boolean): Promise<void> {
  await db.recurringRules.update(id, { visibleOnHome: visible, updatedAt: now() });
}

export async function updateRecurringRule(id: ID, input: RecurringRuleInput): Promise<void> {
  await db.recurringRules.update(id, {
    name: input.name.trim(),
    amount: toMinor(input.amount),
    categoryId: input.categoryId,
    subLabel: input.subLabel,
    paymentMethodId: input.paymentMethodId,
    memo: input.memo?.trim() || undefined,
    updatedAt: now(),
  });
}

/** Hard delete — only the template. Expenses logged from it are already
 *  independent records and keep whatever they were given. */
export async function deleteRecurringRule(id: ID): Promise<void> {
  await db.recurringRules.delete(id);
}

/** Files an expense from a saved template, dated now.
 *
 *  No idempotency guard, deliberately. The scheduled version needed one so a
 *  catch-up pass couldn't write the same occurrence twice, but a tap is the
 *  user saying "this happened" — and it can genuinely happen twice in a day.
 *  Blocking the second coffee would be the bug.
 *
 *  `lastUsedAt` is what orders the list, so the templates someone actually
 *  reaches for drift to the front. */
/** 템플릿을 썼다고 표시한다. 칩을 누른 순간이 아니라 "추가!"로 실제 저장된
 *  뒤에 부른다 — 채워만 놓고 그만둔 것까지 사용으로 세면 정렬이 쓰지도 않은
 *  걸 위로 올린다. */
export async function touchTemplate(id: ID): Promise<void> {
  const stamp = now();
  await db.recurringRules.update(id, { lastUsedAt: stamp, updatedAt: stamp });
}

/** 입력 화면 금액 칸에 넣을 문자열. 키패드가 들고 있는 상태가 숫자열이라
 *  변환이 한 번 끼는데, 그 자리에 100으로 나누는 코드가 들어가 60만원짜리가
 *  6천원으로 기록된 적이 있다. 원화는 toMinor가 항등이라 나눌 게 없다.
 *  세 줄짜리라도 함수로 두는 건 이 불변식에 테스트를 걸어두기 위해서다. */
export function templateAmountText(rule: RecurringRuleRecord): string {
  return String(rule.amount);
}
