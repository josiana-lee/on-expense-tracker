import { useEffect } from 'react';
import { useSettings } from './useSettings';

function msUntil(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  return target.getTime() - now.getTime();
}

/** Best-effort only: this fires from a setTimeout living in the page, so it
 *  can only go off while the app process is actually running (a foreground
 *  or backgrounded tab, or an installed PWA Chrome hasn't fully killed) —
 *  not once the app is truly closed. A reminder that reliably survives that
 *  needs either Web Push (which needs a server we don't have) or, once this
 *  ships wrapped in Capacitor, a native local-notifications plugin. The
 *  settings screen says as much so "켰는데 왜 안 울렸지" has an answer.
 *
 *  Recomputes the delay to the next occurrence each time rather than a
 *  fixed 24h setInterval, so it can't drift and isn't thrown off by DST. */
export function useReminderScheduler(): void {
  const settings = useSettings();
  const enabled = settings?.reminderEnabled ?? false;
  const time = settings?.reminderTime;

  useEffect(() => {
    if (!enabled || !time) return undefined;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return undefined;

    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(() => {
        new Notification('오늘 지출 기록했어?', {
          body: '아직이면 잊기 전에 적어두자.',
          tag: 'daily-reminder',
        });
        schedule();
      }, msUntil(time));
    };
    schedule();

    return () => window.clearTimeout(timer);
  }, [enabled, time]);
}
