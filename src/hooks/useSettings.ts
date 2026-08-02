import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { SettingsRecord } from '../db/types';

/** Seeded during bootstrap, so this is only undefined for the first frame. */
export function useSettings(): SettingsRecord | undefined {
  return useLiveQuery(() => db.settings.get('app'), []);
}
