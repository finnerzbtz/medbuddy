import { isNative } from '@/native/platform';
import { planNativeReminders } from '@/domain/native-reminders';
import { useEffect, useState } from 'react';
import { nativeDevice, type NotificationDeliverySettings } from '@/native/device';
import { Link } from 'react-router-dom';
import { Bell, BellOff, ChevronRight, Download, Send } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { calendarText, download } from '@/domain/exports';
import { dateKey } from '@/domain/schedule';
import { nextReminderTime } from '@/domain/reminders';
import { requestReminderPermission, showReminderNotification } from '@/domain/notifications';
import { useNow, useReminderStatus } from './AppRuntime';

function useReminderView() {
  const data = useAppStore((s) => s.data);
  const now = useNow();
  const { permission, error, scheduled } = useReminderStatus();
  const [delivery, setDelivery] = useState<NotificationDeliverySettings>();
  useEffect(() => {
    if (!isNative) return;
    let current = true;
    void nativeDevice
      .notificationSettings()
      .then((value) => {
        if (current) setDelivery(value);
      })
      .catch(() => {
        /* The reminder queue still reports scheduling errors. */
      });
    return () => {
      current = false;
    };
  }, [now]);
  const enabled = data.preferences.reminders && permission === 'granted';
  const planned = isNative ? planNativeReminders(data, now) : [];
  const next = isNative ? planned[0]?.at : nextReminderTime(data, now);
  const scheduledThrough = scheduled?.through ? new Date(scheduled.through) : undefined;
  const status =
    permission === 'unsupported'
      ? 'Unavailable'
      : permission === 'denied'
        ? 'Blocked'
        : !enabled
          ? 'Off'
          : error
            ? 'Needs attention'
            : isNative && !scheduled
              ? 'Setting up'
              : 'On';
  const timing = next
    ? +next <= +now
      ? 'A check-in is ready now'
      : 'Next alert ' +
        (dateKey(next) === dateKey(now)
          ? ''
          : next.toLocaleDateString([], { weekday: 'short' }) + ', ') +
        next.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'No alerts waiting';
  return { data, enabled, permission, error, status, timing, scheduledThrough, delivery };
}

export function ReminderSummary() {
  const { enabled, status, timing, error } = useReminderView();
  return (
    <Link className="reminder-summary" to="/profile#reminders" aria-label="Manage reminders">
      <span className="reminder-summary-icon">
        {enabled ? (
          <Bell aria-hidden="true" focusable="false" size={17} />
        ) : (
          <BellOff aria-hidden="true" focusable="false" size={17} />
        )}
      </span>
      <span>
        <strong>Reminders {status.toLowerCase()}</strong>
        <small>
          {error && enabled ? 'Check reminder settings' : enabled ? timing : 'Set up your alerts'}
        </small>
      </span>
      <ChevronRight aria-hidden="true" focusable="false" size={16} />
    </Link>
  );
}

export default function ReminderSettings() {
  const { data, enabled, permission, error, status, timing, scheduledThrough, delivery } =
    useReminderView();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [failed, setFailed] = useState(false);
  const hasSchedule = data.medications.some(
    (med) => !med.archived && med.schedules.some((s) => s.active),
  );
  const toggle = async () => {
    setBusy(true);
    setFeedback('');
    setFailed(false);
    try {
      const allowed = enabled
        ? true
        : permission === 'granted' || (await requestReminderPermission()) === 'granted';
      // Update the shared clock/permission display immediately after the prompt resolves.
      window.dispatchEvent(new Event('focus'));
      if (!allowed) {
        setFeedback(
          isNative
            ? 'Allow Reminduh notifications in iPhone Settings, then return here.'
            : 'Allow notifications in your browser’s site settings to turn reminders on.',
        );
        setFailed(true);
        return;
      }
      const result = useAppStore.getState().setPreference('reminders', !enabled);
      if (!result.ok) throw new Error(result.error);
    } catch {
      setFailed(true);
      setFeedback(
        'Reminders could not be enabled. Check notification permissions and device storage.',
      );
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    setBusy(true);
    setFeedback('');
    setFailed(false);
    try {
      await showReminderNotification(true);
      setFeedback(
        isNative
          ? 'Test scheduled for 10 seconds from now. You can lock your iPhone to check it. If no alert appears, check notification settings and Focus mode.'
          : 'Test sent. If it doesn’t appear, check your device’s notification settings and Focus mode.',
      );
    } catch {
      setFailed(true);
      setFeedback(
        'The test could not be sent. Check notification permissions in your device settings.',
      );
    } finally {
      window.dispatchEvent(new Event('focus'));
      setBusy(false);
    }
  };
  return (
    <section className="panel wide-panel reminder-settings" aria-labelledby="reminder-title">
      <div className="section-heading">
        <h2 id="reminder-title">Reminders</h2>
        <span className={'reminder-status ' + (enabled && !error ? 'on' : '')}>{status}</span>
      </div>
      <div className="reminder-setup">
        <div className="reminder-main">
          <div className="reminder-feature">
            <span className="reminder-feature-icon">
              <Bell aria-hidden="true" focusable="false" size={22} strokeWidth={1.6} />
            </span>
            <div>
              <h3>
                {isNative
                  ? 'Device reminders'
                  : enabled
                    ? 'Browser reminders on'
                    : 'Browser reminders'}
              </h3>
              <p>
                {isNative
                  ? 'Get a reminder even when Reminduh is closed.'
                  : 'Keep Reminduh open for alerts. Background tabs may be delayed.'}
              </p>
            </div>
          </div>
          {permission === 'unsupported' ? (
            <p className="reminder-help">
              This browser can’t send alerts here. Try opening Reminduh in your main browser, or use
              calendar reminders below.
            </p>
          ) : permission === 'denied' ? (
            <p className="reminder-help">
              {isNative
                ? 'Notifications are blocked. Open iPhone Settings → Notifications → Reminduh, allow notifications, then return here.'
                : 'Notifications are blocked. Open this site’s browser settings, allow notifications, then return here.'}
            </p>
          ) : (
            <div className="button-row">
              <button
                className={'button ' + (enabled ? 'secondary' : 'primary')}
                disabled={busy}
                onClick={() => void toggle()}
              >
                {enabled
                  ? 'Turn off reminders'
                  : isNative
                    ? 'Enable reminders'
                    : 'Enable browser reminders'}
              </button>
              {enabled && (
                <button className="button secondary" disabled={busy} onClick={() => void test()}>
                  <Send aria-hidden="true" focusable="false" size={15} /> Test notification
                </button>
              )}
            </div>
          )}
          {isNative && (
            <div className="native-reminder-settings-link">
              {enabled &&
                delivery &&
                (!delivery.alerts || !delivery.sounds || !delivery.lockScreen) && (
                  <p className="reminder-help">
                    {!delivery.alerts && 'Banners are off. '}
                    {!delivery.sounds && 'Notification sounds are off. '}
                    {!delivery.lockScreen && 'Lock-screen alerts are off. '}
                    You can change these in iPhone Settings.
                  </p>
                )}
              <button
                className="button secondary"
                onClick={() => {
                  void nativeDevice.openNotificationSettings().catch(() => {
                    setFailed(true);
                    setFeedback('Open iPhone Settings → Notifications → Reminduh.');
                  });
                }}
              >
                Open iPhone notification settings
              </button>
            </div>
          )}
          {data.preferences.reminders && permission !== 'granted' && (
            <button
              className="button secondary"
              onClick={() => useAppStore.getState().setPreference('reminders', false)}
            >
              Turn off reminders
            </button>
          )}
          {enabled && (
            <div className="reminder-next">
              <span className="status-dot" />
              {timing}
            </div>
          )}
          {isNative && enabled && scheduledThrough && (
            <p className="reminder-help">
              Alerts scheduled through{' '}
              {scheduledThrough.toLocaleDateString([], { day: 'numeric', month: 'short' })}. Open
              Reminduh regularly to keep them up to date.
            </p>
          )}
          {(feedback || (enabled && error)) && (
            <p
              className={'reminder-feedback ' + (failed || (!feedback && error) ? 'error' : '')}
              role="status"
            >
              {feedback || error}
            </p>
          )}
        </div>
        <div className="calendar-reminders">
          <div>
            <h3>{isNative ? 'Calendar copy' : 'When the app is closed'}</h3>
            <p>
              Add your schedule to a calendar and confirm its alerts. Re-export after changing your
              schedule.
            </p>
          </div>
          <button
            className="button secondary"
            disabled={!hasSchedule}
            onClick={() =>
              download(calendarText(data), 'reminduh-reminders.ics', 'text/calendar;charset=utf-8')
            }
          >
            <Download aria-hidden="true" focusable="false" size={16} /> Export calendar reminders
          </button>
        </div>
      </div>
      <details className="reminder-details">
        <summary>Privacy & timing</summary>
        <p>
          Alerts hide medication names. Calendar exports include your medication details, so choose
          a private calendar. Times follow your device’s local clock; review your schedule after a
          time-zone change. Snoozing postpones an alert and does not record a dose.
        </p>
        {isNative && (
          <p>
            iOS holds the next 60 alert times, up to 30 days ahead. Opening Reminduh refreshes the
            queue. A separate reminder asks you to return when the queue ends. Focus and
            notification settings can silence alerts; test them on your iPhone.
          </p>
        )}
      </details>
    </section>
  );
}
