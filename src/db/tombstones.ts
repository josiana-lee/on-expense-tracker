import { db } from './db';

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long a deleted row's original contents are kept. `payload` exists only
 *  to back a trash / undo screen; past this the fact of the deletion is all
 *  that's still useful. */
const PAYLOAD_TTL_MS = 30 * DAY_MS;

/** docs/data-model.md §3 calls this a *minimum*, not a target. A tombstone is
 *  what tells a future sync that a row was deleted rather than never seen, so
 *  dropping one before every device has caught up would resurrect the deleted
 *  row. There's no sync yet, so the documented floor is what we use. */
const ROW_TTL_MS = 180 * DAY_MS;

/** Applies the retention docs/data-model.md §3 specified but nothing enforced.
 *
 *  Left alone the table only ever grows, and since it's in BACKUP_TABLES the
 *  full contents of every row the user ever deleted ride along in each backup
 *  file — and come back on restore. Pruning bounds both.
 *
 *  Order matters: expired rows go first so the payload pass only has to walk
 *  what's actually being kept. */
export async function pruneTombstones(nowMs: number = Date.now()): Promise<void> {
  await db.transaction('rw', db.tombstones, async () => {
    await db.tombstones.where('deletedAt').below(nowMs - ROW_TTL_MS).delete();

    await db.tombstones
      .where('deletedAt')
      .below(nowMs - PAYLOAD_TTL_MS)
      .modify((row) => {
        delete row.payload;
      });
  });
}
