import { PRESET_CATEGORIES } from '../data/categories';
import { PRESET_PAYMENTS } from '../data/payments';
import { shareOrDownload } from '../lib/download';
import { BACKUP_TABLES, buildBackupFile } from './backup';
import { db } from './db';
import { fmt } from './date';
import { now } from './id';
import { BackupEnvelopeSchema, TABLE_SCHEMAS } from './restoreSchema';
import { bootstrap } from './seed';

const SUPPORTED_FORMAT_VERSION = 1;

export class RestoreFormatError extends Error {}

/** Thrown when the pre-restore safety copy couldn't be secured, so nothing
 *  was overwritten. */
export class RestoreAbortedError extends Error {}

/** Rows that survive validation but point at a category or payment method
 *  that won't exist after the restore. */
export interface DanglingCounts {
  expenses: number;
  budgets: number;
  recurringRules: number;
  total: number;
}

export interface ParsedRestore {
  exportedAt: string;
  appVersion: string;
  validCounts: Record<(typeof BACKUP_TABLES)[number], number>;
  skippedCounts: Record<(typeof BACKUP_TABLES)[number], number>;
  dangling: DanglingCounts;
  tables: Record<(typeof BACKUP_TABLES)[number], unknown[]>;
}

type Ref = { categoryId?: string; paymentMethodId?: string };

/** Row-level validation checks each row on its own, so an expense pointing at
 *  a category the same file lost still passes. Nothing was reporting that, and
 *  "지출 3,200건 복원" reads like a clean import either way.
 *
 *  What counts as dangling depends on what bootstrap will put back afterwards:
 *  reconcileCategories re-adds any individual preset category that's missing,
 *  so a reference to one is fine. seedPaymentMethods only fires on a
 *  completely empty table, so preset payment methods are only coming back if
 *  the backup had none at all. */
function countDangling(tables: ParsedRestore['tables']): DanglingCounts {
  const categoryIds = new Set(
    (tables.categories as Array<{ id: string }>).map((c) => c.id),
  );
  for (const p of PRESET_CATEGORIES) categoryIds.add(p.key);

  const paymentRows = tables.paymentMethods as Array<{ id: string }>;
  const paymentIds = new Set(paymentRows.map((p) => p.id));
  if (paymentRows.length === 0) {
    for (const p of PRESET_PAYMENTS) paymentIds.add(p.key);
  }

  const broken = (row: Ref) =>
    (row.categoryId !== undefined &&
      row.categoryId !== '*' &&
      !categoryIds.has(row.categoryId)) ||
    (row.paymentMethodId !== undefined && !paymentIds.has(row.paymentMethodId));

  const count = (name: 'expenses' | 'budgets' | 'recurringRules') =>
    (tables[name] as Ref[]).filter(broken).length;

  const expenses = count('expenses');
  const budgets = count('budgets');
  const recurringRules = count('recurringRules');

  return { expenses, budgets, recurringRules, total: expenses + budgets + recurringRules };
}

/** Parses and validates a chosen backup file without touching the DB.
 *  Malformed individual rows are dropped rather than failing the whole
 *  restore — docs/data-model.md §7-1 rule 4 ("Zod로 파싱 후 통과분만 쓴다"). */
export async function parseBackupFile(file: File): Promise<ParsedRestore> {
  const text = await file.text();

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new RestoreFormatError('이 파일은 올바른 백업 파일이 아니야');
  }

  const envelope = BackupEnvelopeSchema.safeParse(json);
  if (!envelope.success) {
    throw new RestoreFormatError('이 파일은 올바른 백업 파일이 아니야');
  }

  if (envelope.data.formatVersion > SUPPORTED_FORMAT_VERSION) {
    throw new RestoreFormatError(
      '이 백업은 더 최신 앱에서 만들어졌어. 앱을 업데이트한 뒤 다시 시도해줘',
    );
  }

  /* buildBackupFile has always recorded the Dexie schema version and nothing
     ever read it. The two version numbers move independently: adding a table
     or an index bumps this without touching formatVersion, so a backup from a
     newer build would otherwise sail past the check above and then fail
     halfway through bulkPut — safe, since the transaction rolls back, but the
     user only sees "복원하지 못했어". Refusing up front says why. */
  if (envelope.data.schemaVersion > db.verno) {
    throw new RestoreFormatError(
      '이 백업은 더 최신 버전의 앱에서 만들어졌어. 앱을 업데이트한 뒤 다시 시도해줘',
    );
  }

  const tables = {} as ParsedRestore['tables'];
  const validCounts = {} as ParsedRestore['validCounts'];
  const skippedCounts = {} as ParsedRestore['skippedCounts'];

  for (const name of BACKUP_TABLES) {
    const schema = TABLE_SCHEMAS[name];
    const rawRows = envelope.data.data[name];
    const rows = Array.isArray(rawRows) ? rawRows : [];

    const valid: unknown[] = [];
    let skipped = 0;
    for (const row of rows) {
      const parsed = schema.safeParse(row);
      if (parsed.success) valid.push(parsed.data);
      else skipped += 1;
    }

    tables[name] = valid;
    validCounts[name] = valid.length;
    skippedCounts[name] = skipped;
  }

  return {
    exportedAt: envelope.data.exportedAt,
    appVersion: envelope.data.appVersion,
    validCounts,
    skippedCounts,
    dangling: countDangling(tables),
    tables,
  };
}

/** 복원 전 현재 데이터를 자동으로 한 번 내보낸다 — 잘못된 백업 파일을 골랐을 때의
 *  마지막 방어선(docs/data-model.md §7-1 rule 2).
 *
 *  This used to call downloadBlob directly and ignore the outcome, on the
 *  reasoning that the user had just picked a file to *restore from* and asking
 *  where to *save* one would confuse them. That holds on the web, where an
 *  `<a download>` click reliably works — but it silently doesn't in a
 *  Capacitor WebView, which is where this app is headed. downloadBlob can't
 *  report that: it never throws and returns nothing, so the one safeguard
 *  standing between a mistaken tap and years of records was unverified
 *  exactly where it was most likely to be absent.
 *
 *  shareOrDownload confirms the hand-off on precisely those platforms — its
 *  `true` means the OS share sheet took the file. Where sharing isn't offered
 *  at all it falls back to the same plain download as before, which is the
 *  web case that already worked. So the extra prompt only appears where it
 *  buys something. */
async function safetyExportBeforeRestore(): Promise<void> {
  const current = await buildBackupFile();
  const blob = new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' });
  const filename = `가계부_복원전백업_${fmt(new Date())}.json`;

  const file = new File([blob], filename, { type: blob.type });
  const canConfirm = Boolean(
    (navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }).canShare?.({
      files: [file],
    }),
  );

  const handedOff = await shareOrDownload(
    blob,
    filename,
    '복원하기 전에 지금 데이터를 백업해 둘게. 저장해줘.',
  );

  /* Only meaningful where the platform could have confirmed it: there,
     `false` means the sheet was dismissed, so the copy very likely doesn't
     exist. Restoring anyway would destroy the data it was meant to protect,
     so stop instead — nothing has been written at this point. */
  if (canConfirm && !handedOff) {
    throw new RestoreAbortedError(
      '복원 전 백업을 저장하지 않아서 멈췄어. 데이터는 그대로야. 다시 시도해줘',
    );
  }
}

/** 전체 교체(replace) — 단일 트랜잭션에서 clear → bulkPut (docs/data-model.md
 *  §7-1 rule 5). MVP는 병합을 지원하지 않는다: 두 기기의 기록을 합치려면 ID
 *  충돌·중복 판정 규칙이 필요한데, 지금은 "기기를 바꿔도 살아남는다"는 요구사항만
 *  충족하면 되므로 그 복잡도를 들일 이유가 없다. */
export async function restoreBackupFile(parsed: ParsedRestore): Promise<number> {
  await safetyExportBeforeRestore();

  // Belongs to *this install*, not to the backup: it identifies this device,
  // and two devices restored from one file must not end up sharing it.
  const localDeviceId = (await db.meta.get('deviceId'))?.value;

  await db.transaction('rw', BACKUP_TABLES, async () => {
    for (const name of BACKUP_TABLES) {
      await db.table(name).clear();
      const rows = parsed.tables[name];
      if (rows.length > 0) await db.table(name).bulkPut(rows);
    }

    /* presetVersion records how far *this device's code* has reconciled, so
       restoring the backup's copy is actively harmful: reconcileCategories()
       would see applied >= PRESET_VERSION and return immediately. Any preset
       category the backup was missing — or that row-level validation had to
       drop — would then be gone permanently, with every expense pointing at
       it orphaned. Zeroing it makes the reconcile below actually run. */
    await db.meta.put({ key: 'presetVersion', value: 0, updatedAt: now() });
    if (localDeviceId !== undefined) {
      await db.meta.put({ key: 'deviceId', value: localDeviceId, updatedAt: now() });
    }
  });

  /* Restore just replaced settings, categories and paymentMethods wholesale,
     and parseBackupFile drops individual malformed rows by design — so any of
     those tables can legitimately come out short or empty. Nothing re-ran the
     invariants that bootstrap normally guarantees, which left three ways to
     end up quietly broken: no settings row (updateSettings uses Dexie's
     update, which reports success on a missing row, so every settings change
     would silently do nothing), no preset categories, and restored recurring
     rules that wouldn't fire until the next launch. Re-running bootstrap
     restores all of it in place; every step is already idempotent, and
     liveQuery pushes the results to the open screens without a reload. */
  await bootstrap();

  return BACKUP_TABLES.reduce((sum, name) => sum + parsed.validCounts[name], 0);
}
