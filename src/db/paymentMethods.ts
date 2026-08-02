import { db } from './db';
import { now } from './id';
import type { ID } from './types';

/** statementEndDay is deliberately never written here. For a repeating
 *  monthly cycle the end is always the day before the next cycle's start —
 *  storing it separately would let a stale value quietly gap or overlap
 *  cycles. The schema keeps the field for a future card where that isn't
 *  true; this app doesn't need it yet. */
export async function setCardStatement(
  id: ID,
  paymentDay: number,
  statementStartDay: number,
): Promise<void> {
  await db.paymentMethods.update(id, { paymentDay, statementStartDay, updatedAt: now() });
}
