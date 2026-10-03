import { PRESET_CATEGORIES } from '../data/categories';
import { PRESET_PAYMENTS } from '../data/payments';
import { BACKUP_TABLES } from './backup';
import { db } from './db';
import { now } from './id';
import { discardRestoreCopy, readRestoreCopyFile, saveRestoreCopy } from './restoreCopy';
import { BackupEnvelopeSchema, TABLE_SCHEMAS } from './restoreSchema';
import { bootstrap } from './seed';

const SUPPORTED_FORMAT_VERSION = 1;

/** 읽어보기 전에 거절할 크기. 50MB. */
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

export class RestoreFormatError extends Error {}

/** 복원 전 사본을 앱 안에 남기지 못해서 멈췄다. 아무것도 덮어쓰지 않았다. */
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
  /* 파일 선택기의 accept="application/json"은 힌트일 뿐 강제가 아니라,
     안드로이드에서는 아무 파일이나 고를 수 있다. 검증은 파일 전체를 문자열로
     읽은 뒤에야 시작되므로, 잘못 고른 동영상 하나면 그 전에 WebView가 죽는다.
     사용자 눈에는 앱이 그냥 꺼진 것으로 보인다.
     한도는 하루 10건씩 10년치 백업(약 14MB)의 세 배 이상으로 잡았다. */
  if (file.size > MAX_BACKUP_BYTES) {
    throw new RestoreFormatError('이 파일은 백업 파일치고 너무 커. 다른 파일인지 확인해줘');
  }

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

/** 전체 교체(replace) — 단일 트랜잭션에서 clear → bulkPut (docs/data-model.md
 *  §7-1 rule 5). MVP는 병합을 지원하지 않는다: 두 기기의 기록을 합치려면 ID
 *  충돌·중복 판정 규칙이 필요한데, 지금은 "기기를 바꿔도 살아남는다"는 요구사항만
 *  충족하면 되므로 그 복잡도를 들일 이유가 없다. */
export async function restoreBackupFile(parsed: ParsedRestore): Promise<number> {
  /* 덮어쓰기 전에 지금 데이터를 앱 안에 사본으로 남긴다 — 잘못된 파일을 골랐을
     때의 마지막 방어선(docs/data-model.md §7-1 rule 2). 사본을 못 남기면
     덮어쓰지 않고 멈춘다. 이 시점엔 아무것도 쓰이지 않았다.
     예전에는 공유창으로 파일을 저장하게 했는데, 그 창을 닫으면 복원이 멈춰서
     처음 보는 사람이 자주 닫았다. 앱 안 사본은 묻지 않고 바로 진행한다. */
  try {
    await saveRestoreCopy();
  } catch {
    throw new RestoreAbortedError(
      '복원 전 사본을 남기지 못해서 멈췄어. 데이터는 그대로야. 저장 공간을 확인하고 다시 시도해줘',
    );
  }
  return replaceAll(parsed);
}

/** 사본이 가리키는 복원 전 상태로 돌아간다. 사본이 없으면 null.
 *
 *  복원과 같은 검증(parseBackupFile)과 같은 덮어쓰기(replaceAll)를 거친다. 다른
 *  길로 쓰면 사본에서 돌아올 때만 deviceId가 바뀌거나 bootstrap이 빠지는 식으로
 *  어긋난다. **새 사본은 만들지 않는다** — 되돌리기를 되돌리는 일이 끝없이
 *  이어지고, 방금 쓴 사본 자리에 지금 상태가 덮인다. */
export async function undoRestore(): Promise<number | null> {
  const file = await readRestoreCopyFile();
  if (!file) return null;

  const rows = await replaceAll(await parseBackupFile(file));
  await discardRestoreCopy();
  return rows;
}

/** "이대로 쓸게". 사본을 버린다. 데이터는 건드리지 않는다. */
export async function keepRestore(): Promise<void> {
  await discardRestoreCopy();
}

async function replaceAll(parsed: ParsedRestore): Promise<number> {
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
