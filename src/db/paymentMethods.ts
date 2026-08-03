import { db } from './db';
import { now, uuidv7 } from './id';
import type { ID, PaymentMethodRecord } from './types';

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

// Rotates independently of the preset cards' own colors, so a user-added
// card doesn't have to collide with — or be coordinated against — whichever
// presets happen to still be active.
const CARD_COLORS = [
  '#C0B6F4',
  '#FFB9AC',
  '#A8C9F7',
  '#F7BEDA',
  '#9BDCD6',
  '#FFD9A0',
  '#B3DCC3',
  '#D9C2F0',
];

export type NewPaymentMethod = {
  name: string;
  kind: 'credit' | 'debit';
};

export async function addPaymentMethod(input: NewPaymentMethod): Promise<ID> {
  const id = uuidv7();
  const stamp = now();
  const name = input.name.trim();
  const all = await db.paymentMethods.toArray();
  const cardCount = all.filter((p) => p.kind !== 'cash').length;

  await db.paymentMethods.add({
    id,
    kind: input.kind,
    name,
    tag: name.slice(0, 1),
    colorHex: CARD_COLORS[cardCount % CARD_COLORS.length],
    sortOrder: stamp,
    archived: false,
    createdAt: stamp,
    updatedAt: stamp,
  });

  return id;
}

export async function updatePaymentMethod(
  id: ID,
  patch: Partial<Pick<PaymentMethodRecord, 'name' | 'kind'>>,
): Promise<void> {
  const next: Partial<PaymentMethodRecord> = { ...patch, updatedAt: now() };
  if (patch.name !== undefined) {
    next.name = patch.name.trim();
    next.tag = next.name.slice(0, 1);
  }
  await db.paymentMethods.update(id, next);
}

/** Archived rather than hard-deleted, same reasoning as categories: every
 *  expense stores its paymentMethodId directly, so removing the row would
 *  turn old records into references to nothing. useCatalog()'s paymentById
 *  map stays unfiltered specifically so archived cards still render
 *  correctly on historical expenses; only the picker chips drop them. */
export async function archivePaymentMethod(id: ID): Promise<void> {
  await db.paymentMethods.update(id, { archived: true, updatedAt: now() });
}

/** Swaps sortOrder with whichever card sits adjacent in the *displayed*
 *  order (active cards, cash excluded) — cheaper than renumbering the whole
 *  list, and sortOrder values only ever need to sort correctly relative to
 *  each other, not hold any particular magnitude. */
export async function moveCard(id: ID, direction: 'up' | 'down'): Promise<void> {
  const all = await db.paymentMethods.toArray();
  const cards = all
    .filter((p) => p.kind !== 'cash' && !p.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const idx = cards.findIndex((c) => c.id === id);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= cards.length) return;

  const a = cards[idx];
  const b = cards[swapIdx];
  await db.transaction('rw', db.paymentMethods, async () => {
    await db.paymentMethods.update(a.id, { sortOrder: b.sortOrder, updatedAt: now() });
    await db.paymentMethods.update(b.id, { sortOrder: a.sortOrder, updatedAt: now() });
  });
}
