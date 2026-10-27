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
  subs?: string[];
};

/** Starts off the home grid — turning it on is a separate, explicit step
 *  (via setCategoryVisible), so adding a category never silently rearranges
 *  the input screen someone already knows by heart. */
export async function addCategory(input: NewCategory): Promise<ID> {
  const id = uuidv7();
  const stamp = now();
  await db.categories.add({
    id,
    type: 'expense',
    name: input.name.trim(),
    colorHex: input.colorHex,
    iconPath: input.iconPath,
    subs: normalizeSubs(input.subs ?? []),
    visibleOnHome: false,
    sortOrder: stamp,
    archived: false,
    customizedFields: [],
    createdAt: stamp,
    updatedAt: stamp,
  });
  return id;
}

/** 세부항목 이름 길이 상한. 칩 여러 개가 한 줄에 앉아야 해서 짧게 둔다. */
export const MAX_SUB_LENGTH = 10;

/** 세부항목 목록을 저장할 모양으로 다듬는다: 앞뒤 공백을 떼고, 길이를 자르고, 빈 것과 겹치는 것을 뺀다.
 *  순서는 사용자가 둔 그대로다. */
export function normalizeSubs(subs: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of subs) {
    const name = raw.trim().slice(0, MAX_SUB_LENGTH).trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/** Preset fields a user edit can claim ownership of. `type` is absent because
 *  no screen edits it. `subs` is here since the category sheet in 설정 can
 *  add, rename and delete them — without the claim, the next PRESET_VERSION
 *  bump would append a deleted preset sub straight back (reconcileCategories
 *  only skips the append when 'subs' is claimed). */
const OWNABLE_FIELDS = ['name', 'colorHex', 'iconPath', 'subs'] as const;

export async function updateCategory(
  id: ID,
  patch: Partial<Pick<CategoryRecord, 'name' | 'colorHex' | 'iconPath' | 'subs'>>,
): Promise<void> {
  const cur = await db.categories.get(id);
  if (!cur) return;

  const next: Partial<CategoryRecord> = { ...patch, updatedAt: now() };
  if (patch.name !== undefined) next.name = patch.name.trim();
  if (patch.subs !== undefined) next.subs = normalizeSubs(patch.subs);

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
      if (value === undefined) continue;
      const changed =
        field === 'subs' ? !sameList(value as string[], cur.subs) : value !== cur[field];
      if (changed) edited.add(field);
    }
    if (edited.size !== cur.customizedFields.length) next.customizedFields = [...edited];
  }

  await db.categories.update(id, next);
}

/** 이 카테고리로 방금 낸 결제수단을 기억해둔다. 입력 탭·기록 수정 시트 양쪽
 *  다 저장이 끝난 뒤 호출한다 — 지출을 쓰는 함수(addExpense·addInstallment·
 *  updateExpense·updateInstallmentGroup) 안에 넣지 않은 건, "지출을 쓴다"와
 *  "이걸 다음 기본값으로 삼는다"가 서로 다른 일이라서다. touchTemplate과
 *  같은 자리, 같은 이유로 UI 쪽에서 부른다.
 *
 *  updatedAt을 건드리지 않는다. 저 필드는 "이 카테고리 자체를 마지막으로
 *  고친 시각"이라, 매번 지출을 쓸 때마다 갱신되면 이름·아이콘을 정작
 *  언제 고쳤는지가 지출 빈도에 묻혀버린다.
 *
 *  실패해도 지출 저장 자체를 막을 일이 아니라서 부르는 쪽이 항상
 *  `.catch(() => {})`로 감싼다 — touchTemplate과 같은 계약이다. */
export async function rememberCategoryPayment(categoryId: ID, paymentMethodId: ID): Promise<void> {
  await db.categories.update(categoryId, { lastPaymentMethodId: paymentMethodId });
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
