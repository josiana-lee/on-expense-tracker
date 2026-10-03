import { db } from '../db';
import { now, uuidv7 } from '../id';
import { addPaymentMethod } from '../paymentMethods';
import type { ExpenseRecord, ID, Minor } from '../types';
import { toMinor } from '../types';
import { dropInstallment, type GroupedRow } from './group';
import { rememberImportedFile } from './imported';
import type { ImportPlan } from './plan';
import { saveLastImport, type LastImport } from './undo';

/** 사용자가 고른 것. 원본 분류명 → 우리 카테고리 id, 또는 null(안 가져옴).
 *
 *  null이 필요한 이유: "카드대금" 같은 분류가 있다. 그건 지출이 아니라 카드값을
 *  갚은 기록이라, 지출로 넣으면 같은 돈이 두 번 세어진다. 무엇을 안 가져올지는
 *  파일을 만든 앱이 아니라 사용자가 안다. */
export type CategoryChoice = Map<string, ID | null>;

export type ImportResult = {
  added: number;
  /** 읽었지만 넣지 않은 행. 사용자가 "가져오지 않기"로 고른 분류의 행과, 붙일 결제수단이
   *  없는 행. */
  skipped: number;
  createdPayments: number;
  /** 방금 이 가져오기의 되돌리기 정보. **한 건도 안 들어갔으면 null.**
   *
   *  화면이 저장소에서 "마지막 가져오기"를 다시 읽으면 안 된다 — 이번에 한 건도 안
   *  들어갔을 때 **이전** 가져오기가 읽혀서 "방금 가져왔어!"로 뜨고, 거기서 되돌리면
   *  엉뚱한 걸 지웠다. */
  last: LastImport | null;
};

/** 계획과 사용자의 선택을 실제 기록으로 앉힌다.
 *
 *  **더하기다.** 복원과 달리 기존 기록을 지우지 않는다 — 가져오기는 쓰던 앱을
 *  옮겨오는 일이지 이 앱을 되돌리는 일이 아니다. 같은 파일을 두 번 넣으면 두 번
 *  들어가는데, 그걸 막겠다고 "같은 날 같은 금액"을 중복으로 치면 진짜로 두 번
 *  쓴 커피가 하나 사라진다. 그래서 거르지 않고, 화면이 미리 말해준다.
 *
 *  **전부 한 트랜잭션이다.** 결제수단 만들기, 기록 넣기, 되돌리기 정보 저장이 같이
 *  들어가거나 같이 안 들어간다. 예전에는 카드를 먼저 만들고 기록을 300건씩 따로
 *  커밋하고 되돌리기 정보를 맨 마지막에 저장했다 — 중간에 멈추면(저장 공간이 모자라
 *  거나, 앱이 내려가거나) 이미 들어간 기록과 만들어진 카드가 남는데 되돌릴 방법이
 *  없었고, "다시 시도해줘"를 누르면 중복이 생겼다. 대신 진행률은 없다. 몇천 건을
 *  한 번에 넣는 데 1초가 안 걸려서, 끊어 넣을 값어치보다 하나도 안 들어갔다는 보장이
 *  크다.
 *
 *  트랜잭션 안에서는 Dexie 밖의 비동기를 기다리지 않는다(setTimeout 등). 기다리는
 *  동안 트랜잭션이 끝나 버린다. */
export async function runImport(plan: ImportPlan, choices: CategoryChoice): Promise<ImportResult> {
  // 1. 실제로 넣을 행을 먼저 정한다. 카드는 그다음에 필요한 것만 만든다.
  const kept: { row: GroupedRow; categoryId: ID }[] = [];
  let skipped = 0;
  for (const r of plan.rows) {
    const categoryId = plan.matched.get(r.categoryName) ?? choices.get(r.categoryName) ?? null;
    if (!categoryId || !plan.payments.has(r.paymentName)) {
      skipped++;
      continue;
    }
    kept.push({ row: r, categoryId });
  }

  /* 묶음의 일부만 가져오게 됐으면(분류를 "가져오지 않기"로 골라서) 남은 회차를 일반
     지출로 바꾼다. 할부로 두면 "2개월 할부 1/2"과 총액이 달렸는데 나머지가 없는 반쪽
     할부가 된다. */
  const members = new Map<ID, number>();
  for (const { row } of kept) {
    if (row.installmentId) {
      members.set(row.installmentId, (members.get(row.installmentId) ?? 0) + 1);
    }
  }
  const rows = kept.map(({ row, categoryId }) => ({
    row:
      row.installmentId && (members.get(row.installmentId) ?? 0) !== row.installmentMonths
        ? dropInstallment(row)
        : row,
    categoryId,
  }));

  if (rows.length === 0) return { added: 0, skipped, createdPayments: 0, last: null };

  // 2. 실제로 쓰는 결제수단 중 없는 것만 만든다. 안 쓰는 카드를 만들면 자산 탭에
  //    쓰는 기록이 하나도 없는 카드가 남는다.
  const used = new Set(rows.map(({ row }) => row.paymentName));
  const importId = uuidv7();
  const stamp = now();
  const createdPaymentIds: ID[] = [];
  let last: LastImport | null = null;

  await db.transaction('rw', db.expenses, db.paymentMethods, db.meta, async () => {
    const paymentId = new Map<string, ID>();
    for (const name of used) {
      const target = plan.payments.get(name)!;
      if ('id' in target) {
        paymentId.set(name, target.id);
      } else {
        const id = await addPaymentMethod(target.create);
        paymentId.set(name, id);
        // 되돌릴 때 이 카드들을 같이 치우려고 기억해 둔다.
        createdPaymentIds.push(id);
      }
    }

    const records: ExpenseRecord[] = rows.map(({ row: r, categoryId }) => ({
      id: uuidv7(),
      date: r.date,
      /* 원본이 시각을 주면 그대로 쓴다. 안 주는 형식은 00:00으로 둔다 — 하루치가 전부
         같은 시각으로 붙지만, 모르는 값을 지어내서 하루 목록의 순서를 꾸며내는 것보다
         낫고, 이 앱은 시각으로 묶는 화면이 없다. */
      time: r.time ?? '00:00',
      amount: toMinor(r.amount),
      type: 'expense',
      categoryId,
      subLabel: r.label,
      paymentMethodId: paymentId.get(r.paymentName)!,
      memo: r.memo?.trim() || undefined,
      importId,
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
    }));

    await db.expenses.bulkAdd(records);

    last = { id: importId, at: stamp, count: records.length, createdPaymentIds };
    await saveLastImport(last);
    /* 어떤 파일을 가져왔는지. 같은 파일을 또 고르면 알려주고, 되돌리기 목록이 이 가져오기의
       카드를 기억하는 데 쓴다. 기록과 같이 들어가거나 같이 안 들어간다. */
    await rememberImportedFile({
      ...(plan.fingerprint ? { hash: plan.fingerprint } : {}),
      importId,
      at: stamp,
      count: records.length,
      createdPaymentIds,
    });
  });

  return { added: rows.length, skipped, createdPayments: createdPaymentIds.length, last };
}
