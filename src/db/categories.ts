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

/** Preset fields a user edit can claim ownership of. `subs` and `type` are
 *  absent because no screen edits them — add them here if that changes. */
const OWNABLE_FIELDS = ['name', 'colorHex', 'iconPath'] as const;

export async function updateCategory(
  id: ID,
  patch: Partial<Pick<CategoryRecord, 'name' | 'colorHex' | 'iconPath'>>,
): Promise<void> {
  const cur = await db.categories.get(id);
  if (!cur) return;

  const next: Partial<CategoryRecord> = { ...patch, updatedAt: now() };
  if (patch.name !== undefined) next.name = patch.name.trim();

  /* Record which preset fields the user has taken over, so the next preset
     catalogue bump leaves them alone — reconcileCategories() reads exactly
     this set (docs/data-model.md §6-3). Nothing wrote it before, so `edited`
     was always empty there and the first PRESET_VERSION bump would have
     silently reverted every rename and recolour the user had made.

     Only presets need this. A user-created category has no preset to be
     reconciled against, so tracking it would just be noise. */
  if (cur.presetKey) {
    const edited = new Set(cur.customizedFields);
    for (const field of OWNABLE_FIELDS) {
      const value = next[field];
      if (value !== undefined && value !== cur[field]) edited.add(field);
    }
    if (edited.size !== cur.customizedFields.length) next.customizedFields = [...edited];
  }

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
