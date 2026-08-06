import { db } from './db';
import { now } from './id';
import type { SettingsRecord, TimeStr } from './types';

export async function updateSettings(
  patch: Partial<Omit<SettingsRecord, 'id'>>,
): Promise<void> {
  await db.settings.update('app', { ...patch, updatedAt: now() });
}

/** Where the daily reminder lands when it is switched on for the first time,
 *  and the fallback whenever a stored time is missing or unusable. */
export const DEFAULT_REMINDER_TIME: TimeStr = '21:00';

/** Writes the reminder settings together, enforcing the one rule a plain
 *  patch cannot express: reminderTime is never an empty string.
 *
 *  `<input type="time">` reports '' the moment the user clears it. Stored,
 *  that leaves reminderEnabled true while useReminderScheduler — which reads
 *  the time as falsy — cancels the schedule. The toggle goes on reading "on"
 *  and the alarm never fires again. There is no server to notice, so the user
 *  finds out by missing the reminder they thought they had set.
 *
 *  The invariant lives here rather than in the settings screen because both
 *  the toggle and the time field write these fields, and a rule enforced at
 *  one call site is a rule the next call site gets to break. */
export async function setReminder(enabled: boolean, time?: string): Promise<void> {
  await updateSettings({
    reminderEnabled: enabled,
    reminderTime: time?.trim() || DEFAULT_REMINDER_TIME,
  });
}
