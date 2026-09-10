import { LocalNotifications } from '@capacitor/local-notifications';
import type { AppData } from '@/types';
import { planNativeReminders } from '@/domain/native-reminders';

let permission: NotificationPermission = 'default';
export const nativeNotificationPermission = () => permission;
export async function refreshNativePermission(request = false) {
  const result = request
    ? await LocalNotifications.requestPermissions()
    : await LocalNotifications.checkPermissions();
  permission =
    result.display === 'granted' ? 'granted' : result.display === 'denied' ? 'denied' : 'default';
  return permission;
}
export const REMINDER_REFRESH_ID = 2100000001;
export const REMINDER_TEST_ID = 2100000002;
/** The iOS plugin can resolve schedule() before UNUserNotificationCenter.add
 * completes. Read the OS queue back before calling an alert scheduled. */
async function confirmScheduled(notifications: { id: number; schedule: { at: Date } }[]) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { notifications: pending } = await LocalNotifications.getPending();
    const future = notifications.filter((item) => +item.schedule.at > Date.now());
    if (future.every((item) => pending.some((saved) => saved.id === item.id))) return;
    if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('iOS did not confirm the reminder queue.');
}
let queue: Promise<unknown> = Promise.resolve();

export function syncNativeReminders(data: AppData) {
  // Serialize OS changes: a late schedule call must never resurrect cancelled doses.
  const operation = queue
    .catch(() => {})
    .then(async () => {
      const granted = (await refreshNativePermission()) === 'granted';
      const plan = granted ? planNativeReminders(data) : [];
      const notifications = plan.map((item) => ({
        id: item.id,
        title: 'Time for a check-in',
        body: 'Your Reminduh schedule is ready. Open the app to check in.',
        schedule: { at: item.at },
        extra: { kind: 'dose', token: item.token, doseIds: item.doseIds },
        sound: 'default',
        foreground: true,
      }));
      const last = plan.at(-1);
      const renewal = last
        ? [
            {
              id: REMINDER_REFRESH_ID,
              title: 'Keep your reminders ready',
              body: 'Open Reminduh to refresh your upcoming reminders.',
              schedule: { at: new Date(+last.at + 60000) },
              extra: { kind: 'refresh', token: 'refresh:' + +last.at, doseIds: [] as string[] },
              sound: 'default',
              foreground: true,
            },
          ]
        : [];
      const wanted = [...notifications, ...renewal];
      const { notifications: pending } = await LocalNotifications.getPending();
      const obsolete = pending.filter(
        (item) =>
          (!data.preferences.reminders || !granted || item.id !== REMINDER_TEST_ID) &&
          !wanted.some((next) => next.id === item.id),
      );
      if (obsolete.length)
        await LocalNotifications.cancel({ notifications: obsolete.map(({ id }) => ({ id })) });
      const added = wanted.filter(
        (item) =>
          !pending.some((old) => old.id === item.id && old.extra?.token === item.extra.token),
      );
      if (added.length) await LocalNotifications.schedule({ notifications: added });
      await confirmScheduled(wanted);
      const delivered = await LocalNotifications.getDeliveredNotifications();
      const stale = delivered.notifications.filter((item) => {
        if (!data.preferences.reminders || !granted) return true;
        const ids: string[] = item.extra?.doseIds ?? [];
        return (
          ids.length > 0 &&
          ids.every(
            (id) =>
              data.records[id] ||
              data.reminders[id]?.snoozedUntil ||
              !data.medications.some(
                (med) =>
                  id.startsWith(med.id + '@') && !med.archived && med.schedules.at(-1)?.active,
              ),
          )
        );
      });
      if (stale.length)
        await LocalNotifications.removeDeliveredNotifications({ notifications: stale });
      return { count: plan.length, through: last?.at.toISOString() };
    });
  queue = operation;
  return operation;
}
export async function testNativeReminder() {
  if ((await refreshNativePermission()) !== 'granted')
    throw new Error('Notification permission is required.');
  const notification = {
    id: REMINDER_TEST_ID,
    title: 'Reminduh test',
    body: 'Your device reminders are working.',
    schedule: { at: new Date(Date.now() + 10000) },
    sound: 'default',
    foreground: true,
    extra: { kind: 'test' },
  };
  await LocalNotifications.schedule({ notifications: [notification] });
  await confirmScheduled([notification]);
}
