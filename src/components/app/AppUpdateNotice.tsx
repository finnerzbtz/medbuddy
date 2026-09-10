import { applyAppUpdate, useAppUpdate } from '@/registerOffline';
import './app-update.css';

export default function AppUpdateNotice() {
  const { ready, dismissed, applying, error } = useAppUpdate();
  if (!ready || dismissed) return null;
  return (
    <section className="app-update" aria-label="App update">
      <p role="status">{error || (applying ? 'Updating…' : 'An update is ready.')}</p>
      <div>
        <button
          type="button"
          className="button primary"
          disabled={applying}
          onClick={applyAppUpdate}
        >
          Reload to update
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={applying}
          onClick={() => {
            useAppUpdate.setState({ dismissed: true });
            document.getElementById('main-content')?.focus();
          }}
        >
          Later
        </button>
      </div>
    </section>
  );
}
