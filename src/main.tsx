import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { hydrateNativeStorage } from './native/storage';
import { isNative } from './native/platform';
import { refreshNativePermission } from './native/reminders';
import { SplashScreen } from '@capacitor/splash-screen';
import './index.css';
import './components/app/app-refresh.css';
import './components/app/accessibility.css';
import './components/shop/shop.css';
import './typography.css';
import './registerOffline';

async function start() {
  await hydrateNativeStorage();
  if (isNative) await refreshNativePermission().catch(() => {});
  const { default: App } = await import('./App');
  const { startCloudRuntime } = await import('./cloud/engine');
  const stopCloud = startCloudRuntime();
  if (import.meta.hot) import.meta.hot.dispose(stopCloud);
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
void start().catch(() => {
  if (isNative) void SplashScreen.hide();
  const root = document.getElementById('root')!;
  root.innerHTML =
    '<main class="panel" style="margin:80px 24px" role="alert"><h1>Your data couldn’t be opened</h1><p>Your saved information has been kept. Close and reopen Reminduh to try again.</p><button type="button" class="button primary">Try again</button></main>';
  root.querySelector('button')?.addEventListener('click', () => window.location.reload());
});
