import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';

const REMINDER_DAYS = 14;
const REMINDER_MS = REMINDER_DAYS * 24 * 60 * 60 * 1000;

/** docs/data-model.md §7-1 B: badge the 설정 탭 once 14 days pass without a
 *  restorable backup. A brand-new install has no `lastBackupAt` yet, so it
 *  falls back to `installedAt` (always seeded on boot) rather than nagging
 *  immediately — the clock starts at install, not at the first backup. */
export function useBackupOverdue(): boolean {
  const rows = useLiveQuery(() => db.meta.bulkGet(['lastBackupAt', 'installedAt']), []);
  if (!rows) return false;

  const [lastBackupRow, installedRow] = rows;
  const baseline =
    (lastBackupRow?.value as number | undefined) ?? (installedRow?.value as number | undefined);
  if (!baseline) return false;

  return Date.now() - baseline > REMINDER_MS;
}
