import { useEffect } from 'react';
import {
  cancelDailyReminder,
  scheduleDailyReminder,
  showReminderNow,
} from '../lib/notifications';
import { isNative } from '../lib/platform';
import { useSettings } from './useSettings';

function msUntil(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  return target.getTime() - now.getTime();
}

/** Keeps the daily reminder in step with the settings.
 *
 *  Native hands the schedule to the OS, which fires it whether or not the app
 *  is running — the only arrangement under which a daily reminder is worth
 *  switching on. Re-registering on every settings change is cheap and the
 *  plugin replaces the previous one by id, so there is no drift between what
 *  the toggle says and what is actually scheduled.
 *
 *  The browser has no such facility, so it falls back to a timer living in
 *  the page: it can only fire while the app is open. Kept because the dev
 *  server is where this is built and checked.
 *
 *  The web timer recomputes the delay to the next occurrence each time rather
 *  than using a fixed 24h interval, so it can't drift and isn't thrown off
 *  by DST. */
export function useReminderScheduler(): void {
  const settings = useSettings();
  const enabled = settings?.reminderEnabled ?? false;
  const time = settings?.reminderTime;

  useEffect(() => {
    if (isNative) {
      if (enabled && time) void scheduleDailyReminder(time);
      else void cancelDailyReminder();
      return undefined;
    }

    if (!enabled || !time) return undefined;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      return undefined;
    }

    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(() => {
        showReminderNow();
        schedule();
      }, msUntil(time));
    };
    schedule();

    return () => window.clearTimeout(timer);
  }, [enabled, time]);
}
