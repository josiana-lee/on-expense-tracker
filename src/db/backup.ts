import { db } from './db';
import { fmt } from './date';
import { openMailto, shareOrDownload } from '../lib/download';

export const APP_VERSION = '0.1.0';

/** Explicit allowlist rather than `db.tables` — a table added later has to
 *  be added here on purpose. budgetAlerts is left out per
 *  docs/data-model.md §7-1: it's a fire-once idempotency guard (blocks a
 *  budget-exceeded alert from firing twice for the same threshold), not
 *  user data, and restoring it would resurrect stale locks. */
export const BACKUP_TABLES = [
  'expenses',
  'categories',
  'paymentMethods',
  'accounts',
  'budgets',
  'recurringRules',
  'settings',
  'tombstones',
  'meta',
] as const;

export interface BackupFile {
  formatVersion: 1;
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  deviceId: string;
  counts: Record<(typeof BACKUP_TABLES)[number], number>;
  data: Record<(typeof BACKUP_TABLES)[number], unknown[]>;
}

export async function buildBackupFile(): Promise<BackupFile> {
  const tables = await Promise.all(BACKUP_TABLES.map((name) => db.table(name).toArray()));

  const data = {} as BackupFile['data'];
  const counts = {} as BackupFile['counts'];
  BACKUP_TABLES.forEach((name, i) => {
    data[name] = tables[i];
    counts[name] = tables[i].length;
  });

  const deviceIdRow = await db.meta.get('deviceId');

  return {
    formatVersion: 1,
    schemaVersion: db.verno,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    deviceId: (deviceIdRow?.value as string | undefined) ?? 'unknown',
    counts,
    data,
  };
}

export function totalBackupRows(counts: BackupFile['counts']): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}

export interface ICloudBackupResult {
  rows: number;
  shared: boolean;
}

/** "아이클라우드에 백업하기" — a web PWA has no CloudKit access (that needs a
 *  native iOS plugin, which waits for the Capacitor wrap), so this hands the
 *  backup file to the OS share sheet and lets the user pick "파일에 저장" →
 *  iCloud Drive themselves, the same way emailBackup() lets them pick a mail
 *  app. `shared` tells the caller whether the share sheet actually took it,
 *  so it can word the toast correctly when it fell back to a plain
 *  download instead. */
export async function icloudBackup(): Promise<ICloudBackupResult> {
  const backup = await buildBackupFile();
  const rows = totalBackupRows(backup.counts);
  const filename = `가계부_백업_${fmt(new Date())}.json`;
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });

  const shared = await shareOrDownload(
    blob,
    filename,
    '가계부 백업 파일이야. "파일에 저장"을 골라서 iCloud Drive에 저장해줘.',
  );

  return { rows, shared };
}

/** "이메일로 백업하기" — there's no client-side way to actually send an email
 *  with an attachment (that needs a mail server), so this hands the backup
 *  file to whatever the platform offers instead. On Android that's the share
 *  sheet, which drops the file straight into Gmail/Outlook's compose screen
 *  when the user picks one — functionally identical to a native app's
 *  "share via email" for the one thing that matters, getting the file into
 *  a draft. Only where sharing isn't available at all does this fall back
 *  to downloading the file and opening a plain mailto: compose, since that
 *  can't carry the attachment itself. */
export async function emailBackup(): Promise<number> {
  const backup = await buildBackupFile();
  const rows = totalBackupRows(backup.counts);
  const filename = `가계부_백업_${fmt(new Date())}.json`;
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });

  const shared = await shareOrDownload(
    blob,
    filename,
    '가계부 백업 파일이야. 이메일 앱을 골라서 나에게 보내줘.',
  );

  if (!shared) {
    openMailto(
      `가계부 백업 (${fmt(new Date())})`,
      `${filename} 파일을 다운로드했어. 이 메일에 그 파일을 첨부해서 보내줘.`,
    );
  }

  return rows;
}
