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

export async function updateAccount(
  id: ID,
  patch: Partial<{ name: string; kind: AccountRecord['kind']; balance: number }>,
): Promise<void> {
  const next: Partial<AccountRecord> = {
    ...patch,
    balance: patch.balance !== undefined ? toMinor(patch.balance) : undefined,
    updatedAt: now(),
  };
  // Editing the balance is the user re-asserting "this is true right now" —
  // the snapshot date has to move with it, or a derived "이번 달 입출금"
  // display on top of it would silently start lying.
  if (patch.balance !== undefined) next.balanceAsOf = fmt(new Date());
  await db.accounts.update(id, next);
}

export async function deleteAccount(id: ID): Promise<void> {
  await deleteWithTombstone('accounts', id);
}
