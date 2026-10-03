import { db } from '../db';
import { now, uuidv7 } from '../id';
import { addPaymentMethod } from '../paymentMethods';
import type { ExpenseRecord, ID, Minor } from '../types';
import { toMinor } from '../types';
import type { ImportPlan } from './plan';

/** 사용자가 고른 것. 원본 분류명 → 우리 카테고리 id, 또는 null(안 가져옴).
 *
 *  null이 필요한 이유: "카드대금" 같은 분류가 있다. 그건 지출이 아니라 카드값을
 *  갚은 기록이라, 지출로 넣으면 같은 돈이 두 번 세어진다. 무엇을 안 가져올지는
 *  파일을 만든 앱이 아니라 사용자가 안다. */
export type CategoryChoice = Map<string, ID | null>;

export type ImportResult = {
  added: number;
  skipped: number;
  createdPayments: number;
};

/* 한 번에 넣는 행 수. 5천 건을 한 덩어리로 밀어 넣으면 그동안 화면이 멎는다.
   끊어 넣고 사이를 한 틱 비워주면 진행 표시가 돌고 탭도 먹는다. */
const CHUNK = 300;

/** 계획과 사용자의 선택을 실제 기록으로 앉힌다.
 *
 *  **더하기다.** 복원과 달리 기존 기록을 지우지 않는다 — 가져오기는 쓰던 앱을
 *  옮겨오는 일이지 이 앱을 되돌리는 일이 아니다. 같은 파일을 두 번 넣으면 두 번
 *  들어가는데, 그걸 막겠다고 "같은 날 같은 금액"을 중복으로 치면 진짜로 두 번
 *  쓴 커피가 하나 사라진다. 그래서 거르지 않고, 화면이 미리 말해준다. */
export async function runImport(
  plan: ImportPlan,
  choices: CategoryChoice,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  /* 없는 결제수단을 먼저 만든다. 기록보다 앞서야 붙일 id가 생긴다. */
  const paymentId = new Map<string, ID>();
  let createdPayments = 0;
  for (const [name, target] of plan.payments) {
    if ('id' in target) {
      paymentId.set(name, target.id);
    } else {
      paymentId.set(name, await addPaymentMethod(target.create));
      createdPayments++;
    }
  }

  const stamp = now();
  const rows: ExpenseRecord[] = [];
  let skipped = 0;

  for (const r of plan.rows) {
    const categoryId = plan.matched.get(r.categoryName) ?? choices.get(r.categoryName) ?? null;
    const payment = paymentId.get(r.paymentName);
    if (!categoryId || !payment) {
      skipped++;
      continue;
    }

    rows.push({
      id: uuidv7(),
      date: r.date,
      /* 원본에 시각이 없다. 00:00으로 두면 하루치 목록이 전부 같은 시각으로
         붙어 어느 것이 먼저인지 알 수 없는데, 어차피 모르는 값이라 지어내지
         않고 그대로 둔다 — 이 앱은 시각으로 묶는 화면이 없다. */
      time: '00:00',
      amount: toMinor(r.amount),
      type: r.type,
      categoryId,
      subLabel: r.label,
      paymentMethodId: payment,
      memo: r.memo?.trim() || undefined,
      ...(r.installmentId
        ? {
            installmentId: r.installmentId,
            installmentNo: r.installmentNo,
            installmentMonths: r.installmentMonths,
            installmentTotal: r.installmentTotal as Minor,
          }
        : {}),
      createdAt: stamp,
      updatedAt: stamp,
    });
  }

  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await db.transaction('rw', db.expenses, async () => {
      await db.expenses.bulkAdd(slice);
    });
    onProgress?.(Math.min(i + CHUNK, rows.length), rows.length);
    // 다음 덩어리 전에 한 틱 양보해서 화면이 다시 그려지게 한다.
    await new Promise((r) => setTimeout(r, 0));
  }

  return { added: rows.length, skipped, createdPayments };
}
