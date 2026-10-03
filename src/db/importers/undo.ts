import { db } from '../db';
import { now } from '../id';
import { forgetImportedFile } from './imported';
import type { Epoch, ID } from '../types';

/** 마지막 가져오기에 대해 되돌릴 때 필요한 것. meta에 한 줄만 둔다.
 *
 *  한 번에 하나만 되돌릴 수 있다. 새로 가져오면 이 줄이 새 것으로 바뀌고, 앞의
 *  가져오기는 기록에 표시만 남은 채 되돌릴 길이 없어진다 — 되돌릴 대상이 여럿이면
 *  화면이 "어느 것을?"을 물어야 하는데, 하나를 되돌리고 싶은 순간은 보통 방금
 *  한 것에 대해서다. */
export type LastImport = {
  id: ID;
  at: Epoch;
  count: number;
  /** 이 가져오기가 새로 만든 결제수단. 되돌릴 때 같이 치운다. */
  createdPaymentIds: ID[];
};

const KEY = 'lastImport';

export async function readLastImport(): Promise<LastImport | null> {
  const row = await db.meta.get(KEY);
  const v = row?.value as Partial<LastImport> | undefined;
  // 형식이 이상하면 없는 것으로 친다. 복원한 백업에서 올 수 있는 값이다.
  if (!v || typeof v.id !== 'string' || typeof v.count !== 'number') return null;
  return {
    id: v.id,
    at: Number(v.at) || 0,
    count: v.count,
    createdPaymentIds: Array.isArray(v.createdPaymentIds) ? v.createdPaymentIds : [],
  };
}

export async function saveLastImport(last: LastImport): Promise<void> {
  await db.meta.put({ key: KEY, value: last, updatedAt: now() });
}

/** 되돌리기를 그만둔다 — "이대로 쓸게". 기록은 그대로고 표시만 지운다. */
export async function keepImport(): Promise<void> {
  await db.meta.delete(KEY);
}

export type UndoResult = {
  removed: number;
  removedPayments: number;
};

/** 가져온 기록을 지운다. 가져오기 전에 있던 기록은 건드리지 않는다.
 *
 *  가져오기가 더하기만 했으므로 이것만 지우면 가져오기 전 상태와 같아진다.
 *  전체를 백업으로 되돌리는 방법도 있지만, 그러면 가져온 뒤에 직접 적은 기록까지
 *  같이 사라진다.
 *
 *  툼스톤은 남기지 않는다. 툼스톤은 "지워졌다"와 "본 적 없다"를 가르려는 것인데,
 *  동기화가 없고 이 기록들은 사용자가 지운 것이 아니라 없던 일로 하는 것이다. 5천
 *  건에 대해 5천 줄을 더 쌓으면 백업 파일만 커진다.
 *
 *  한 트랜잭션이다. 기록만 지우고 카드가 남거나 그 반대로 멈추면 어느 쪽도
 *  설명할 수 없다. */
export async function undoImport(last: LastImport): Promise<UndoResult> {
  return db.transaction(
    'rw',
    [db.expenses, db.paymentMethods, db.settings, db.recurringRules, db.meta],
    async () => {
      const removed = await db.expenses.filter((r) => r.importId === last.id).delete();

      /* 가져오기가 만든 카드만, 그리고 **쓰는 곳이 하나도 없을 때만.** 쓰는 곳은 셋이다:
         기록, 기본 결제수단 설정, 저장해둔 지출. 앱은 카드를 지우지 않고 보관하는데
         이 되돌리기가 처음으로 하드 삭제를 한다 — 기본 결제수단이 그 카드였으면 설정이
         죽은 id를 가리키고, 입력 화면은 그 값을 확인하지 않아서 결제수단 없는 지출이
         저장됐다. */
      const defaultId = (await db.settings.get('app'))?.defaultPaymentMethodId;
      const ruleIds = new Set((await db.recurringRules.toArray()).map((r) => r.paymentMethodId));

      let removedPayments = 0;
      for (const id of last.createdPaymentIds) {
        const stillUsed = await db.expenses.filter((r) => r.paymentMethodId === id).count();
        const used = stillUsed > 0 || defaultId === id || ruleIds.has(id);
        if (!used && (await db.paymentMethods.get(id))) {
          await db.paymentMethods.delete(id);
          removedPayments++;
        }
      }

      /* 되돌렸으면 그 파일은 다시 가져올 수 있어야 한다. 항목이 남아 있으면 지운 기록을
         "이미 가져온 파일"이라고 막는다. */
      await forgetImportedFile(last.id);
      await db.meta.delete(KEY);
      return { removed, removedPayments };
    },
  );
}
