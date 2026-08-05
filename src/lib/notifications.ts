import { isNative } from './platform';

/** The daily "오늘 지출 기록했어?" reminder.
 *
 *  Two implementations behind one interface, because the two platforms differ
 *  in what they can promise:
 *
 *  - Native schedules with the OS, which fires whether or not the app is
 *    running. That is what a daily reminder has to do to be worth switching
 *    on at all.
 *  - The browser can only set a timer inside the page, so it fires only while
 *    the app is open. Kept working anyway, since the dev server is where this
 *    gets built and looked at.
 *
 *  The web `Notification` API does not exist in an Android WebView, so the
 *  branch is not an optimisation — the shared path would simply never fire. */

/** Fixed id: scheduling again replaces the previous one rather than stacking
 *  a second reminder every time the user edits the time. */
const REMINDER_ID = 1;

const TITLE = '오늘 지출 기록했어?';
const BODY = '아직이면 잊기 전에 적어두자.';

const parseTime = (time: string): { hour: number; minute: number } => {
  const [hour, minute] = time.split(':').map(Number);
  return { hour, minute };
};

/** Asks for permission, returning whether the reminder may be switched on.
 *  Called from the toggle rather than from the scheduler so a refusal can be
 *  reported to the user at the moment they asked for it. */
export async function requestReminderPermission(): Promise<boolean> {
  if (isNative) {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return true;
    /* Android 13+ has to be asked; below that it is granted at install. */
    const asked = await LocalNotifications.requestPermissions();
    return asked.display === 'granted';
  }

  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

/** True where a reminder can actually survive the app being closed. The
 *  settings screen uses it to decide whether it owes the user a caveat. */
export const remindersAreReliable = isNative;

/** Registers the repeating daily notification with the OS. Native only —
 *  the browser has nothing to register with, and keeps using the in-page
 *  timer in useReminderScheduler. */
export async function scheduleDailyReminder(time: string): Promise<void> {
  if (!isNative) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
  await LocalNotifications.schedule({
    notifications: [
      {
        id: REMINDER_ID,
        title: TITLE,
        body: BODY,
        /* `on` without a day repeats at that time every day. `allowWhileIdle`
           lets it through Doze, which is exactly the case that matters: the
           phone has been sitting untouched all evening. */
        schedule: { on: parseTime(time), allowWhileIdle: true },
      },
    ],
  });
}

export async function cancelDailyReminder(): Promise<void> {
  if (!isNative) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
}

/** Fires the reminder right now. The web path's timer calls this; native
 *  never does, since the OS owns delivery there. */
export function showReminderNow(): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  new Notification(TITLE, { body: BODY, tag: 'daily-reminder' });
}
