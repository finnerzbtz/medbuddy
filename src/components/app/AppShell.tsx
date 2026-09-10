import { useCloudStore } from '@/cloud/store';
import { Outlet, Link, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import TopBar from '@/components/ui/TopBar';
import BottomNav from '@/components/ui/BottomNav';
import AppUpdateNotice from './AppUpdateNotice';
export default function AppShell() {
  const cloudStatus = useCloudStore((s) => s.status);
  const onboarded = useAppStore((s) => s.data.onboarded),
    location = useLocation();
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const target = location.hash
        ? document.getElementById(location.hash.slice(1))
        : new URLSearchParams(location.search).has('feed')
          ? document.getElementById('blobby-room')
          : null;
      if (target) {
        target.scrollIntoView({ block: 'start' });
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      } else {
        window.scrollTo({ top: 0, behavior: 'instant' });
        document.getElementById('main-content')?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, location.hash]);
  if (!onboarded && !['/profile', '/help', '/account'].includes(location.pathname))
    return <Navigate to="/welcome" replace />;
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <TopBar />
      <AppUpdateNotice />
      <div className="app-layout">
        <aside className="app-sidebar">
          <BottomNav />
          <Link className="studio-link" to="/studio">
            Asset studio <ArrowUpRight aria-hidden="true" focusable="false" size={15} />
          </Link>
        </aside>
        <main id="main-content" className="app-main" tabIndex={-1} key={location.pathname}>
          {['conflict', 'signin', 'error'].includes(cloudStatus) &&
            location.pathname !== '/account' && (
              <div className="cloud-notice" role="status">
                <span>
                  {cloudStatus === 'conflict'
                    ? 'Your cloud copies need a review.'
                    : cloudStatus === 'signin'
                      ? 'Sign in to resume cloud sync.'
                      : 'Cloud sync needs attention.'}
                </span>
                <Link to="/account">Your account</Link>
              </div>
            )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
