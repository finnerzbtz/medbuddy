import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, Send } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { isNative } from '@/native/platform';
import { nativeDevice } from '@/native/device';
import { syncNativeReminders } from '@/native/reminders';
import {
  notificationPermission,
  requestReminderPermission,
  showReminderNotification,
} from '@/domain/notifications';
import { useReminderStatus } from '@/components/app/AppRuntime';
import './reminder-onboarding.css';

export default function ReminderOnboarding() {
  const reminders = useAppStore((s) => s.data.preferences.reminders);
  const { permission: currentPermission } = useReminderStatus();
  const [permission, setPermission] = useState(notificationPermission);
  const [ready, setReady] = useState(reminders && permission === 'granted');
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [failed, setFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    setPermission(currentPermission);
  }, [currentPermission]);
  useEffect(() => {
    if (ready) heading.current?.focus({ preventScroll: true });
  }, [ready]);
  const allow = async () => {
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      // Only a tap can request permission. Not now never invokes the OS prompt.
      const allowed =
        notificationPermission() === 'granted' ? 'granted' : await requestReminderPermission();
      if (!active.current) return;
      setPermission(allowed);
      window.dispatchEvent(new Event('focus'));
      if (allowed !== 'granted') return;
      const result = useAppStore.getState().setPreference('reminders', true);
      if (!result.ok) throw new Error(result.error);
      if (isNative) await syncNativeReminders(useAppStore.getState().data);
      if (active.current) setReady(true);
    } catch {
      if (active.current) {
        setFailed(true);
        setMessage(
          'Reminders aren’t ready yet. Try again, or continue and check reminder settings later.',
        );
      }
    } finally {
      if (active.current) setBusy(false);
    }
  };
  const blocked = permission === 'denied';
  const unavailable = permission === 'unsupported';
  const on = ready && reminders && permission === 'granted';
  return (
    <section className="panel reminder-onboarding" aria-labelledby="reminder-onboarding-title">
      <span className="reminder-onboarding-symbol" aria-hidden="true">
        {on ? <Check size={30} /> : <Bell size={30} />}
      </span>
      <h1 id="reminder-onboarding-title" ref={heading} tabIndex={-1}>
        {on
          ? 'Reminders are on'
          : blocked
            ? 'Reminders are blocked'
            : 'Turn on medication reminders?'}
      </h1>
      <p>
        {on
          ? 'Your medication schedule will be used for reminders. You can change this at any time.'
          : isNative
            ? 'Get a notification at your medication times, even when Reminduh is closed.'
            : 'Get an alert at your medication times while Reminduh is open in your browser.'}
      </p>
      {!on && !blocked && !unavailable && <p>Medication names stay out of notifications.</p>}
      {blocked && (
        <p>
          {isNative
            ? 'Allow notifications in iPhone Settings, then return here to finish setup.'
            : 'Allow notifications in your browser’s site settings, then return here.'}
        </p>
      )}
      {unavailable && (
        <p>
          This browser can’t send alerts here. You can use calendar reminders in settings instead.
        </p>
      )}
      <div className="reminder-onboarding-actions">
        {on ? (
          <>
            <Link className="button primary full" to="/" replace>
              Go to Blobby
            </Link>
            <button
              className="button secondary full"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setMessage('');
                setFailed(false);
                try {
                  await showReminderNotification(true);
                  if (active.current)
                    setMessage(
                      isNative
                        ? 'Test scheduled for 10 seconds from now. Lock your iPhone to check it.'
                        : 'Test notification sent.',
                    );
                } catch {
                  if (active.current) {
                    setFailed(true);
                    setMessage('The test could not be sent. Check notification settings.');
                  }
                } finally {
                  if (active.current) setBusy(false);
                }
              }}
            >
              <Send size={17} aria-hidden="true" />
              Test notification
            </button>
          </>
        ) : (
          <>
            {!blocked && !unavailable && (
              <button className="button primary full" disabled={busy} onClick={() => void allow()}>
                {busy
                  ? 'Setting up…'
                  : isNative
                    ? 'Allow notifications'
                    : 'Enable browser reminders'}
              </button>
            )}
            {blocked && isNative && (
              <button
                className="button primary full"
                onClick={() => {
                  void nativeDevice.openNotificationSettings().catch(() => {
                    setFailed(true);
                    setMessage('Open iPhone Settings → Notifications → Reminduh.');
                  });
                }}
              >
                Open iPhone settings
              </button>
            )}
            {unavailable && (
              <Link className="button secondary full" to="/profile#reminders">
                Calendar reminders
              </Link>
            )}
            <Link className="button secondary full" to="/" replace>
              {blocked || unavailable || failed ? 'Continue to Blobby' : 'Not now'}
            </Link>
          </>
        )}
      </div>
      <p
        className={failed ? 'form-error' : 'reminder-onboarding-feedback'}
        role="status"
        aria-live="polite"
      >
        {message}
      </p>
      <p className="reminder-onboarding-later">
        You can manage reminders in My Blobby → Reminders.
      </p>
    </section>
  );
}
