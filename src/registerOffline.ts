// Keep HMR and native apps free of service-worker caches.
import { create } from 'zustand';
import { isNative } from './native/platform';

export const useAppUpdate = create<{
  ready: boolean;
  dismissed: boolean;
  applying: boolean;
  error: string;
}>(() => ({ ready: false, dismissed: false, applying: false, error: '' }));

let registration: ServiceWorkerRegistration | undefined;
let changedController = false;
let reloadRequested = false;
let updateTimeout = 0;

export function applyAppUpdate() {
  if (useAppUpdate.getState().applying) return;
  // Another tab may already have activated the new version. Reload only on this user's action.
  if (changedController) {
    window.location.reload();
    return;
  }
  const worker = registration?.waiting;
  if (!worker) return;
  reloadRequested = true;
  useAppUpdate.setState({ applying: true, error: '' });
  worker.postMessage({ type: 'ACTIVATE_UPDATE' });
  updateTimeout = window.setTimeout(() => {
    reloadRequested = false;
    useAppUpdate.setState({ applying: false, error: 'The update could not finish. Try again.' });
  }, 12000);
}

if (!isNative && import.meta.env.PROD && 'serviceWorker' in navigator) {
  let hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadRequested) {
      window.clearTimeout(updateTimeout);
      window.location.reload();
    } else if (hadController) {
      changedController = true;
      useAppUpdate.setState({ ready: true, dismissed: false });
    }
    hadController = true;
  });
  // A cached app can open while its server is unavailable. Retry when the user
  // comes back or reconnects; a failed first load must not strand an old version.
  let checking = false;
  const checkForUpdate = async () => {
    if (checking || document.hidden || !navigator.onLine) return;
    checking = true;
    try {
      if (registration) {
        await registration.update();
        return;
      }
      const r = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
      registration = r;
      const offerUpdate = () => {
        if (r.waiting && navigator.serviceWorker.controller)
          useAppUpdate.setState({ ready: true, dismissed: false });
      };
      offerUpdate();
      const watchInstall = () => r.installing?.addEventListener('statechange', offerUpdate);
      watchInstall();
      r.addEventListener('updatefound', watchInstall);
    } catch {
      // Keep the working offline copy. A later focus, connection or interval retries.
    } finally {
      checking = false;
    }
  };
  if (document.readyState === 'complete') void checkForUpdate();
  else window.addEventListener('load', () => void checkForUpdate(), { once: true });
  window.addEventListener('focus', () => void checkForUpdate());
  window.addEventListener('online', () => void checkForUpdate());
  document.addEventListener('visibilitychange', () => void checkForUpdate());
  window.setInterval(() => void checkForUpdate(), 60000);
}
