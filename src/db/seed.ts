import { PRESET_CATEGORIES, PRESET_VERSION } from '../data/categories';
import { PRESET_PAYMENTS } from '../data/payments';
import { db } from './db';
import { now, uuidv7 } from './id';
import { materializeDueRules } from './recurring';
import { pruneTombstones } from './tombstones';
import type { CategoryRecord } from './types';

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
  await materializeDueRules();
  void requestPersistence();
  // Housekeeping, and nothing on screen reads tombstones — awaiting it would
  // just push the first render back for no visible gain. A failure here means
  // one skipped sweep, which the next launch picks up.
  void pruneTombstones().catch(() => {});
}
