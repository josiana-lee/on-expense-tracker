import { db } from '../db';
import type { Epoch, ID } from '../types';
import { forgetImportedFile, readImportedFiles } from './imported';

/** 가져오기 한 번이 남긴 것 중 되돌릴 때 필요한 것. */
export type LastImport = {
  id: ID;
  at: Epoch;
  count: number;
  /** 이 가져오기가 새로 만든 결제수단. 되돌릴 때 쓰는 곳이 없으면 같이 치운다. */
  createdPaymentIds: ID[];
};

/** "가져온 기록" 목록의 한 줄. */
export type ImportEntry = LastImport & {
  /** 지금 남아 있는 기록의 합계(원). */
  spend: number;
};

/** 가져온 기록을 가져오기별로 묶어서, 새것부터 돌려준다.
 *
 *  **기록에 붙은 `importId`에서 만든다.** 가져온 기록은 전부 표시를 달고 있어서, 따로
 *  목록을 저장하지 않아도 어떤 가져오기가 몇 건 남아 있는지 알 수 있다. 되돌리기 정보를
 *  한 줄만 두던 때는 두 번째로 가져오면 첫 번째를 되돌릴 길이 없어졌는데, 같은 파일을
 *  실수로 두 번 넣었을 때 정작 되돌리고 싶은 건 첫 번째였다.
 *
 *  건수와 합계는 **지금 남아 있는 것**을 센다. 가져온 뒤에 몇 건을 지웠으면 그만큼 줄어
 *  있고, 전부 지웠으면 목록에서 사라진다. 카드 정보와 가져온 시각은 `importedFiles`에서
 *  보태고, 거기 없으면(그 항목이 생기기 전에 가져온 것) 기록의 생성 시각으로 대신한다. */
export async function listImports(): Promise<ImportEntry[]> {
  const known = new Map((await readImportedFiles()).map((e) => [e.importId, e]));
  const groups = new Map<ID, { count: number; spend: number; firstAt: Epoch }>();

  await db.expenses
    .filter((r) => !!r.importId)
    .each((r) => {
      const g = groups.get(r.importId!) ?? { count: 0, spend: 0, firstAt: r.createdAt };
      g.count += 1;
      g.spend += r.amount;
      if (r.createdAt < g.firstAt) g.firstAt = r.createdAt;
      groups.set(r.importId!, g);
    });

  return [...groups.entries()]
    .map(([id, g]) => ({
      id,
      at: known.get(id)?.at ?? g.firstAt,
      count: g.count,
      spend: g.spend,
      createdPaymentIds: known.get(id)?.createdPaymentIds ?? [],
    }))
    .sort((a, b) => b.at - a.at);
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
export async function undoImport(last: Pick<LastImport, 'id' | 'createdPaymentIds'>): Promise<UndoResult> {
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
      return { removed, removedPayments };
    },
  );
}
