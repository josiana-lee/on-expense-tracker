import { moveImportedTitlesToMemo } from './importers/migrate';
import { DEFAULT_VISIBLE_V1, PRESET_CATEGORIES, PRESET_VERSION } from '../data/categories';
import { PRESET_PAYMENTS } from '../data/payments';
import { db } from './db';
import { now, uuidv7 } from './id';
import { pruneTombstones } from './tombstones';
import type { CategoryRecord } from './types';

/** 기본 노출 목록을 어디까지 따라왔는지. presetVersion과 따로 두는 이유는 복원이
 *  presetVersion을 0으로 되돌리기 때문이다 — 그 표시까지 같이 돌아가면, 열여섯 개를
 *  보고 네 개를 도로 끈 사람이 복원 한 번에 다시 열여섯 개가 된다. meta는 백업에
 *  실려 다니므로 이 키는 그 사람을 따라간다. */
const HOME_DEFAULTS_KEY = 'homeVisibleDefaults';
const HOME_DEFAULTS_VERSION = 2;

/** 입력 화면에 켜둔 카테고리가 예전 기본값 그대로인지. 하나라도 끄거나 켰거나 직접
 *  만든 카테고리를 올렸다면 그건 사용자가 꾸민 화면이라 손대지 않는다. */
function isUntouchedHomeGrid(rows: CategoryRecord[]): boolean {
  const visible = rows.filter((c) => c.visibleOnHome && !c.archived).map((c) => c.presetKey ?? c.id);
  return (
    visible.length === DEFAULT_VISIBLE_V1.length &&
    DEFAULT_VISIBLE_V1.every((key) => visible.includes(key))
  );
}

/** Folds catalogue changes into the user's copy without clobbering their edits.
 *
 *  Runs on every boot, gated by meta.presetVersion — NOT by Dexie's upgrade
 *  hook, which only fires when tables or indexes change. A release that merely
 *  renames a preset leaves the schema untouched, so an upgrade-hook version of
 *  this would never run. */
export async function reconcileCategories(): Promise<void> {
  const meta = await db.meta.get('presetVersion');
  const applied = (meta?.value as number) ?? 0;
  if (applied >= PRESET_VERSION) return;

  await db.transaction('rw', db.categories, db.meta, async () => {
    const existing = await db.categories.toArray();
    const byKey = new Map(existing.filter((c) => c.presetKey).map((c) => [c.presetKey!, c]));
    const presetKeys = new Set(PRESET_CATEGORIES.map((p) => p.key));

    /* 기본 노출을 12개에서 16개(4열 × 2줄 두 장)로 늘렸다. 쓰던 기기에서도 두 번째
       장이 차야 하지만, 표시 여부는 사용자 설정이라 덮어쓸 수 없다. 그래서 지금
       켜둔 목록이 예전 기본값과 글자 그대로 같을 때만 — 한 번도 건드린 적이 없다는
       뜻일 때만 — 새 기본값을 따라가게 한다. */
    const homeDefaults = (await db.meta.get(HOME_DEFAULTS_KEY))?.value as number | undefined;
    const adoptDefaults =
      (homeDefaults ?? 0) < HOME_DEFAULTS_VERSION && isUntouchedHomeGrid(existing);

    for (const p of PRESET_CATEGORIES) {
      const cur = byKey.get(p.key);

      if (!cur) {
        await db.categories.add({
          id: p.key,
          presetKey: p.key,
          type: p.type,
          name: p.name,
          colorHex: p.colorHex,
          iconPath: p.iconPath,
          subs: [...p.subs],
          visibleOnHome: p.defaultVisibleOnHome,
          sortOrder: p.defaultSortOrder,
          archived: false,
          customizedFields: [],
          createdAt: now(),
          updatedAt: now(),
        });
        continue;
      }

      const edited = new Set(cur.customizedFields);
      const patch: Partial<CategoryRecord> = { deprecated: false };
      if (adoptDefaults && p.defaultVisibleOnHome && !cur.visibleOnHome) {
        patch.visibleOnHome = true;
      }
      if (!edited.has('name')) patch.name = p.name;
      if (!edited.has('colorHex')) patch.colorHex = p.colorHex;
      if (!edited.has('type')) patch.type = p.type;
      // Icons used to land unconditionally, on the grounds that a retouch was
      // always ours and never the user's intent. The category sheet's swatch
      // picker changed that — picking a swatch is a deliberate icon choice —
      // so it's now honoured like any other claimed field.
      if (!edited.has('iconPath')) patch.iconPath = p.iconPath;

      // Append only. Resurrecting a sub the user deleted is obviously annoying.
      if (!edited.has('subs')) {
        const added = p.subs.filter((s) => !cur.subs.includes(s));
        if (added.length) patch.subs = [...cur.subs, ...added];
      }

      patch.updatedAt = now();
      await db.categories.update(cur.id, patch);
    }

    // A preset dropped from the catalogue is flagged, never deleted — records
    // from three years ago still point at it.
    for (const c of existing) {
      if (c.presetKey && !presetKeys.has(c.presetKey) && !c.deprecated) {
        await db.categories.update(c.id, { deprecated: true, updatedAt: now() });
      }
    }

    await db.meta.put({ key: 'presetVersion', value: PRESET_VERSION, updatedAt: now() });
    /* 따라갔든, 꾸며둔 화면이라 그냥 뒀든, 새 기본값은 한 번만 제안한다. 이 표시가
       없으면 다음 프리셋 갱신 때 다시 켜져서 도로 끈 네 개가 계속 살아난다. */
    await db.meta.put({ key: HOME_DEFAULTS_KEY, value: HOME_DEFAULTS_VERSION, updatedAt: now() });
  });
}

/** Payment methods seed once and then belong to the user — unlike categories
 *  they carry per-card settings we must never overwrite. */
async function seedPaymentMethods(): Promise<void> {
  if ((await db.paymentMethods.count()) > 0) return;

  await db.paymentMethods.bulkAdd(
    PRESET_PAYMENTS.map((p) => ({
      id: p.key,
      presetKey: p.key,
      kind: p.kind,
      name: p.name,
      tag: p.tag,
      colorHex: p.colorHex,
      sortOrder: p.sortOrder,
      archived: false,
      createdAt: now(),
      updatedAt: now(),
    })),
  );
}

async function ensureSettings(): Promise<void> {
  if (await db.settings.get('app')) return;

  await db.settings.put({
    id: 'app',
    monthStartDay: 1,
    weekStartDay: 0,
    defaultPaymentMethodId: PRESET_PAYMENTS[0].key,
    baseCurrency: 'KRW',
    reminderEnabled: false,
    themeMode: 'system',
    budgetAlertThresholds: [0.8, 1.0],
    updatedAt: now(),
  });
}

async function ensureMeta(): Promise<void> {
  if (!(await db.meta.get('deviceId'))) {
    await db.meta.put({ key: 'deviceId', value: uuidv7(), updatedAt: now() });
  }
  if (!(await db.meta.get('installedAt'))) {
    await db.meta.put({ key: 'installedAt', value: now(), updatedAt: now() });
  }
}

/** Asks the browser not to evict our data under storage pressure. Usually
 *  granted for installed PWAs; a refusal is not fatal, so we don't block on it. */
async function requestPersistence(): Promise<void> {
  try {
    if (!navigator.storage?.persist) return;
    if (await navigator.storage.persisted()) return;
    await navigator.storage.persist();
  } catch {
    // Storage API unavailable or blocked — the app works either way.
  }
}

/** Must finish before the first render, or the input screen flashes an empty
 *  category grid. */
export async function bootstrap(): Promise<void> {
  await db.open();
  await ensureMeta();
  await ensureSettings();
  await seedPaymentMethods();
  await reconcileCategories();
  /* 옛 가져오기가 세부항목 칸에 넣은 제목을 메모로 옮긴다. 복원 뒤에도 bootstrap이 다시 돌아서
     옛 백업을 복원한 경우를 같이 잡는다. 실패해도 시작을 막지 않는다 — 표시를 못 남겼으니
     다음에 켤 때 다시 한다. */
  await moveImportedTitlesToMemo().catch(() => undefined);
  void requestPersistence();
  // Housekeeping, and nothing on screen reads tombstones — awaiting it would
  // just push the first render back for no visible gain. A failure here means
  // one skipped sweep, which the next launch picks up.
  void pruneTombstones().catch(() => {});
}
