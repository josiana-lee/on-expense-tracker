import { buildMemoStats, type MemoRow, type MemoStat } from '../lib/memoSuggest';
import { db } from './db';

/** 쌓인 기록에서 "전에 쓴 메모" 이력을 만든다. 팝업이 열릴 때 한 번 읽는다.
 *
 *  메모가 붙은 행만 읽는다. 기록이 수천 건이어도 한 번의 훑기라 팝업이 뜨는 애니메이션
 *  동안 끝나고, 따로 인덱스나 저장소를 두지 않는다 — 두면 기록을 고치거나 지울 때마다
 *  그쪽도 맞춰야 하는데, 그걸 빠뜨리면 지운 메모가 계속 추천에 뜬다. */
export async function loadMemoStats(today: Date = new Date()): Promise<MemoStat[]> {
  const rows: MemoRow[] = [];
  await db.expenses
    .filter((r) => !!r.memo)
    .each((r) =>
      rows.push({
        memo: r.memo,
        categoryId: r.categoryId,
        // 할부는 한 회차가 아니라 결제 총액이 사람이 금액 칸에 치는 값이다.
        amount: r.installmentTotal ?? r.amount,
        date: r.date,
        installmentId: r.installmentId,
      }),
    );
  return buildMemoStats(rows, today);
}
