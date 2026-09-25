import { db } from './db';

const DAY_MS = 24 * 60 * 60 * 1000;

/* payload는 더 이상 쓰지 않는다. 휴지통/실행취소 화면을 받치려고 30일간
   들고 있던 것인데, 그 화면을 만들지 않기로 했다 — 지우면 지워지고, 다시
   필요하면 사용자가 다시 적는다. 지우는 쪽은 이미 복사를 멈췄고, 여기서는
   이미 붙어 있는 것을 나이와 상관없이 걷어낸다. 업데이트를 받은 기기가 첫
   실행에서 한 번 털어내고, 그 뒤로는 걸릴 게 없어 공회전한다. */

/** docs/data-model.md §3 calls this a *minimum*, not a target. A tombstone is
 *  what tells a future sync that a row was deleted rather than never seen, so
 *  dropping one before every device has caught up would resurrect the deleted
 *  row. There's no sync yet, so the documented floor is what we use. */
const ROW_TTL_MS = 180 * DAY_MS;

/** Applies the retention docs/data-model.md §3 specified but nothing enforced.
 *
 *  Left alone the table only ever grows, and it is in BACKUP_TABLES, so it
 *  rides along in every backup file and comes back on restore. Pruning bounds
 *  that.
 *
 *  Order matters: expired rows go first, so the payload sweep only walks what
 *  is actually being kept. */
export async function pruneTombstones(nowMs: number = Date.now()): Promise<void> {
  await db.transaction('rw', db.tombstones, async () => {
    await db.tombstones.where('deletedAt').below(nowMs - ROW_TTL_MS).delete();

    await db.tombstones.filter((row) => row.payload !== undefined).modify((row) => {
      delete row.payload;
    });
  });
}
