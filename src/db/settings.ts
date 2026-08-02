import { db } from './db';
import { now } from './id';
import type { SettingsRecord } from './types';

export async function updateSettings(
  patch: Partial<Omit<SettingsRecord, 'id'>>,
): Promise<void> {
  await db.settings.update('app', { ...patch, updatedAt: now() });
}
