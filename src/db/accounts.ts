import { db, deleteWithTombstone } from './db';
import { fmt } from './date';
import { now, uuidv7 } from './id';
import type { AccountRecord, ID } from './types';
import { toMinor } from './types';

export type NewAccount = {
  name: string;
  kind: AccountRecord['kind'];
  balance: number;
};

export async function addAccount(input: NewAccount): Promise<ID> {
  const id = uuidv7();
  const stamp = now();
  await db.accounts.add({
    id,
    name: input.name,
    kind: input.kind,
    balance: toMinor(input.balance),
    balanceAsOf: fmt(new Date()),
    sortOrder: stamp,
    archived: false,
    createdAt: stamp,
    updatedAt: stamp,
  });
  return id;
}

/** Keys are attached one at a time rather than spread, because Dexie treats an
 *  `undefined` value in an update patch as "delete this field", not "leave it
 *  alone". This used to hand `balance: undefined` to every call that didn't
 *  set a balance, which would have wiped the stored balance off the record —
 *  invisible so far only because the one caller always sends all three
 *  fields. Anything omitted here simply isn't written. */
export async function updateAccount(
  id: ID,
  patch: Partial<{ name: string; kind: AccountRecord['kind']; balance: number }>,
): Promise<void> {
  const next: Partial<AccountRecord> = { updatedAt: now() };

  if (patch.name !== undefined) next.name = patch.name;
  if (patch.kind !== undefined) next.kind = patch.kind;
  if (patch.balance !== undefined) {
    next.balance = toMinor(patch.balance);
    // Editing the balance is the user re-asserting "this is true right now" —
    // the snapshot date has to move with it, or a derived "이번 달 입출금"
    // display on top of it would silently start lying.
    next.balanceAsOf = fmt(new Date());
  }

  await db.accounts.update(id, next);
}

export async function deleteAccount(id: ID): Promise<void> {
  await deleteWithTombstone('accounts', id);
}
