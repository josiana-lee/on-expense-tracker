import { db } from '../db';
import { now } from '../id';

const KEY = 'importedTitlesMoved';

/** 이미 가져온 기록의 제목을 세부항목 칸에서 메모 칸으로 옮긴다. **한 번만.**
 *
 *  예전 가져오기는 원본의 "내역"을 세부항목(`subLabel`)에 넣었다. 세부항목은 칩에서 고르는
 *  칸이라 수정 화면에서 그 글을 고칠 수 없었고, 직접 입력한 기록(제목이 메모에 있다)과 목록
 *  규칙도 갈렸다. 지금 가져오기는 내역을 메모에 넣는다 — 이 함수는 이미 들어온 기록을 같은
 *  모양으로 맞춘다.
 *
 *  **옮기는 건 메모가 비어 있는 가져온 기록뿐이다.** 메모가 이미 있으면 세부항목의 글이 내역인지
 *  하위 분류인지 알 수 없어서(원본이 하위 분류를 줬으면 내역이 메모로 갔다) 건드리지 않는다.
 *  글을 지우지 않고 칸만 옮기며, 목록에서 보이는 모양은 그대로다(제목은 내역).
 *
 *  표시는 한 번 옮긴 뒤에 남긴다. 안 남기면 매번 켤 때마다 돌아서, 새로 가져온 기록 중 세부항목만
 *  있는 것(하위 분류만 있고 내역이 없는 행)까지 메모로 옮겨 버린다. 표시는 백업에도 들어가서,
 *  옛 백업(표시 없음)을 복원하면 다시 돌고 새 백업(표시 있음)을 복원하면 돌지 않는다.
 *
 *  돌려주는 값은 옮긴 건수. 이미 했으면 0. */
export async function moveImportedTitlesToMemo(): Promise<number> {
  return db.transaction('rw', db.expenses, db.meta, async () => {
    if (await db.meta.get(KEY)) return 0;
    const moved = await db.expenses
      .filter((r) => !!r.importId && !r.memo && !!r.subLabel)
      .modify((r) => {
        r.memo = r.subLabel;
        delete r.subLabel;
      });
    await db.meta.put({ key: KEY, value: true, updatedAt: now() });
    return moved;
  });
}
