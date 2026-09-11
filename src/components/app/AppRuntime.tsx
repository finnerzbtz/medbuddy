import { isNative } from '@/native/platform';
import { syncNativeReminders } from '@/native/reminders';
import { appAudio } from '@/audio/AppAudio';
import DoseCelebration from './DoseCelebration';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X, Undo2, AlertCircle, Check } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { dueReminders, reminderCandidates, reminderTime } from '@/domain/reminders';
import {
  closeRemindersWhen,
  notificationPermission,
  showReminderNotification,
} from '@/domain/notifications';

const ClockContext = createContext(new Date());
export const useNow = () => useContext(ClockContext);
const ReminderContext = createContext<{
  permission: ReturnType<typeof notificationPermission>;
  error: string;
  scheduled?: { count: number; through?: string };
}>({ permission: notificationPermission(), error: '' });
export const useReminderStatus = () => useContext(ReminderContext);
export function AppRuntime({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => new Date());
  const data = useAppStore((s) => s.data);
  const reactionUntil = useAppStore((s) => s.reactionUntil);
  const location = useLocation();
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(data.preferences.reducedMotion);
    document.documentElement.dataset.hideRewards = String(data.preferences.hideRewards);
  }, [data.preferences.reducedMotion, data.preferences.hideRewards]);
  useEffect(() => {
    const page =
      location.pathname === '/'
        ? 'Today'
        : location.pathname === '/meds/new'
          ? 'Add medication'
          : location.pathname.endsWith('/edit')
            ? 'Edit medication'
            : ((
                {
                  '/routines': 'Your routines',
                  '/meds': 'Medications',
                  '/log': 'History',
                  '/shop': 'Blobby shop',
                  '/music': 'Record player',
                  '/profile': 'My Blobby',
                  '/welcome': 'Welcome',
                  '/welcome/reminders': 'Set up reminders',
                  '/help': 'Help & accessibility',
                  '/studio': 'Asset studio',
                } as Record<string, string>
              )[location.pathname] ?? 'Page not found');
    document.title = page + ' · Reminduh';
  }, [location.pathname]);
  const busy = useRef(false);
  const retry = useRef({ key: '', after: 0 });
  const delivered = useRef(new Set<string>());
  const [reminderError, setReminderError] = useState('');
  const [scheduled, setScheduled] = useState<{ count: number; through?: string }>();
  const permission = notificationPermission();
  useEffect(() => {
    const update = () => {
      setNow(new Date());
      useAppStore.getState().sync();
    };
    const interval = setInterval(update, 15000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  useEffect(() => {
    if (reactionUntil <= 0) return;
    const timer = setTimeout(
      () => useAppStore.getState().settle(),
      Math.max(0, reactionUntil - Date.now()) + 50,
    );
    return () => clearTimeout(timer);
  }, [reactionUntil]);
  useEffect(() => {
    void closeRemindersWhen(() => {
      const latest = useAppStore.getState().data;
      return (
        !latest.preferences.reminders ||
        !reminderCandidates(latest).some((dose) => reminderTime(latest, dose) <= Date.now())
      );
    });
  }, [data, now]);
  useEffect(() => {
    if (isNative) {
      let current = true;
      void syncNativeReminders(data)
        .then((confirmed) => {
          if (current) {
            setScheduled(confirmed);
            setReminderError('');
          }
        })
        .catch(() => {
          if (current) {
            setScheduled(undefined);
            setReminderError(
              'Your device reminders could not be updated. Check notification settings and reopen Reminduh.',
            );
          }
        });
      return () => {
        current = false;
      };
    }
    if (!data.preferences.reminders || permission !== 'granted') {
      setReminderError('');
      return;
    }
    if (busy.current) return;
    busy.current = true;
    const notify = async () => {
      // Read again inside the lock: a second tab may already have delivered this batch.
      useAppStore.getState().sync();
      const latest = useAppStore.getState();
      if (!latest.data.preferences.reminders || notificationPermission() !== 'granted') return;
      const token = (dose: { id: string; snoozedUntil?: string }) =>
        dose.id + ':' + (dose.snoozedUntil ?? '');
      const due = dueReminders(latest.data).filter((dose) => !delivered.current.has(token(dose)));
      if (!due.length) {
        if (!delivered.current.size) setReminderError('');
        return;
      }
      const key = JSON.stringify(due);
      if (retry.current.key === key && Date.now() < retry.current.after) return;
      try {
        await showReminderNotification();
        appAudio.cue('reminder');
        const result = useAppStore.getState().markNotified(due);
        if (!result.ok) {
          due.forEach((dose) => delivered.current.add(token(dose)));
          setReminderError(
            'The alert was sent, but its status could not be saved. Check your device storage.',
          );
          return;
        }
        retry.current = { key: '', after: 0 };
        setReminderError('');
      } catch {
        // Keep unsent doses eligible, with a quiet backoff instead of repeated error toasts.
        retry.current = { key, after: Date.now() + 60000 };
        setReminderError('An alert could not be sent. We’ll retry while the app is open.');
      }
    };
    const run = async () => {
      try {
        if ('locks' in navigator) {
          await navigator.locks.request(
            'reminduh-notifications',
            { ifAvailable: true },
            async (lock) => {
              if (lock) await notify();
            },
          );
        } else await notify();
      } catch {
        setReminderError('Reminders could not start. Check your browser permissions.');
      } finally {
        busy.current = false;
      }
    };
    void run();
  }, [data, now, permission]);
  return (
    <ClockContext.Provider value={now}>
      <ReminderContext.Provider value={{ permission, error: reminderError, scheduled }}>
        {children}
        <StorageNotice />
        <Toast />
        <DoseCelebration />
      </ReminderContext.Provider>
    </ClockContext.Provider>
  );
}
function StorageNotice() {
  const error = useAppStore((s) => s.storageError);
  return error ? (
    <aside className="storage-notice" role="alert">
      <AlertCircle aria-hidden="true" focusable="false" size={20} />
      <span>{error}</span>
      <Link to="/profile#your-data">Open data settings</Link>
    </aside>
  ) : null;
}
function Toast() {
  const toast = useAppStore((s) => s.toast);
  const { pathname } = useLocation();
  const displayed = useRef({ toast, pathname });
  useLayoutEffect(() => {
    const previous = displayed.current;
    displayed.current = { toast, pathname };
    // Leave a contextual confirmation on its page for as long as it is needed.
    // A later navigation clears it, but a save that creates a new message and
    // navigates must still show its arrival confirmation, even if the router
    // transition commits after the external store update.
    // Medication Undo stays available across pages until explicitly dismissed.
    if (
      toast &&
      toast === previous.toast &&
      pathname !== previous.pathname &&
      pathname !== toast.destination &&
      !toast.undoId &&
      !toast.checkIn
    ) {
      useAppStore.getState().dismissToast();
    }
  }, [toast, pathname]);
  const returnFocus = useRef<HTMLElement | null>(null);
  const notice = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const active = document.activeElement;
    // Removing Undo can briefly return focus to body before this effect runs.
    // Keep the earlier meaningful target so dismissal can fall back to the page.
    if (
      toast &&
      active instanceof HTMLElement &&
      active !== document.body &&
      active !== document.documentElement &&
      !notice.current?.contains(active)
    )
      returnFocus.current = active;
    const element = notice.current;
    const update = () =>
      document.documentElement.style.setProperty(
        '--notice-height',
        (toast ? (element?.getBoundingClientRect().height ?? 0) : 0) + 'px',
      );
    update();
    const observer = new ResizeObserver(update);
    if (element) observer.observe(element);
    return () => {
      observer.disconnect();
      document.documentElement.style.setProperty('--notice-height', '0px');
    };
  }, [toast]);
  const restoreFocus = () =>
    requestAnimationFrame(() => {
      const target = returnFocus.current;
      if (target?.isConnected) target.focus();
      // A disclosure may have hidden the original trigger while the notice stayed.
      if (!target || document.activeElement !== target || !target.getClientRects().length)
        document.getElementById('main-content')?.focus({ preventScroll: true });
    });
  return (
    <div
      className={
        toast ? 'app-toast' + (toast.checkIn ? ' checkin-confirmation' : '') : 'visually-hidden'
      }
      ref={notice}
    >
      {toast?.checkIn && (
        <i className="checkin-confirmation-icon" aria-hidden="true">
          <Check size={20} />
        </i>
      )}
      <span role="status" aria-atomic="true">
        {toast?.message ?? ''}
      </span>
      {toast?.undoId && (
        <button
          onClick={() => {
            const r = useAppStore.getState().undoDose(toast.undoId!);
            if (!r.ok) useAppStore.getState().showToast(r.error!);
            restoreFocus();
          }}
        >
          <Undo2 aria-hidden="true" focusable="false" size={16} /> Undo
        </button>
      )}
      {toast && (
        <button
          aria-label="Dismiss message"
          className="icon-button"
          onClick={() => {
            useAppStore.getState().dismissToast();
            restoreFocus();
          }}
        >
          <X aria-hidden="true" focusable="false" size={18} />
        </button>
      )}
    </div>
  );
}
