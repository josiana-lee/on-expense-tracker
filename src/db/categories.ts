import { db } from './db';
import { now, uuidv7 } from './id';
import type { CategoryRecord, ID } from './types';

export async function setCategoryVisible(id: ID, visibleOnHome: boolean): Promise<void> {
  await db.categories.update(id, { visibleOnHome, updatedAt: now() });
}

export type NewCategory = {
  name: string;
  colorHex: string;
  iconPath: string;
};

/** Starts off the home grid — turning it on is a separate, explicit step
 *  (via setCategoryVisible), so adding a category never silently evicts
 *  another one from the 12-cap or breaks it. */
export async function addCategory(input: NewCategory): Promise<ID> {
  const id = uuidv7();
  const stamp = now();
  await db.categories.add({
    id,
    type: 'expense',
    name: input.name.trim(),
    colorHex: input.colorHex,
    iconPath: input.iconPath,
    subs: [],
    visibleOnHome: false,
    sortOrder: stamp,
    archived: false,
    customizedFields: [],
    createdAt: stamp,
    updatedAt: stamp,
  });
  return id;
}

export async function updateCategory(
  id: ID,
  patch: Partial<Pick<CategoryRecord, 'name' | 'colorHex' | 'iconPath'>>,
): Promise<void> {
  const next: Partial<CategoryRecord> = { ...patch, updatedAt: now() };
  if (patch.name !== undefined) next.name = patch.name.trim();
  await db.categories.update(id, next);
}

/** Archived rather than hard-deleted — same reasoning as payment methods:
 *  every expense stores categoryId directly, so removing the row would turn
 *  old records into references to nothing. useCatalog()'s byId map stays
 *  unfiltered specifically so archived categories still render correctly on
 *  historical expenses; only the pickers and home grid drop them. Also
 *  clears visibleOnHome so an archived category can't linger on the grid. */
export async function archiveCategory(id: ID): Promise<void> {
  await db.categories.update(id, { archived: true, visibleOnHome: false, updatedAt: now() });
}
