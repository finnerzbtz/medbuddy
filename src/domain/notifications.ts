import { isNative } from '@/native/platform';
import {
  nativeNotificationPermission,
  refreshNativePermission,
  testNativeReminder,
} from '@/native/reminders';

export async function requestReminderPermission() {
  return isNative ? refreshNativePermission(true) : Notification.requestPermission();
}

export type ReminderPermission = NotificationPermission | 'unsupported';
let desktopReminder: Notification | undefined;

export async function closeRemindersWhen(shouldClose: () => boolean): Promise<void> {
  if (isNative || !shouldClose()) return;
  desktopReminder?.close();
  desktopReminder = undefined;
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const notifications = await registration?.getNotifications({ tag: 'reminduh-due' });
    if (shouldClose()) notifications?.forEach((notification) => notification.close());
  } catch {
    /* Cleanup is best effort when browser permissions change. */
  }
}

export function notificationPermission(): ReminderPermission {
  if (isNative) return nativeNotificationPermission();
  return typeof window !== 'undefined' && window.isSecureContext && 'Notification' in window
    ? Notification.permission
    : 'unsupported';
}

export async function showReminderNotification(test = false): Promise<void> {
  if (isNative) {
    if (test) return testNativeReminder();
    return; // Native scheduled notifications own delivery; never duplicate them in JS.
  }
  if (notificationPermission() !== 'granted') throw new Error('Notifications are not allowed.');
  const title = test ? 'Your Reminduh test' : 'Time to check in';
  const options: NotificationOptions & { renotify: boolean } = {
    body: test
      ? 'This is how your reminders will look. No check-in has been recorded.'
      : 'Your schedule has a check-in waiting. Open Reminduh to review it.',
    tag: test ? 'reminduh-test' : 'reminduh-due',
    renotify: !test,
    icon: '/icons/icon-192.png',
    data: { url: '/#check-ins' },
  };
  const registration =
    'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (registration?.active) {
    await registration.showNotification(title, options);
    return;
  }
  // Desktop fallback: construction alone does not mean the notification was shown.
  await new Promise<void>((resolve, reject) => {
    const notification = new Notification(title, options);
    const timer = setTimeout(() => {
      notification.close();
      reject(new Error('The browser did not confirm the notification.'));
    }, 5000);
    notification.onshow = () => {
      if (!test) desktopReminder = notification;
      clearTimeout(timer);
      resolve();
    };
    notification.onerror = () => {
      clearTimeout(timer);
      reject(new Error('The browser could not show the notification.'));
    };
    notification.onclick = () => {
      window.focus();
      window.location.assign('/#check-ins');
      notification.close();
    };
  });
}
