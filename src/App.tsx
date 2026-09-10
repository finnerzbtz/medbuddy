import RoutinesPage from '@/components/pages/RoutinesPage';
import '@/components/app/routines.css';
import AccountPage from '@/components/pages/AccountPage';
import { RecordPlayerPage } from '@/components/scene/RecordPlayer';
import NativeRuntime from '@/components/app/NativeRuntime';
import AudioRuntime from '@/components/app/AudioRuntime';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import HelpPage from '@/components/pages/HelpPage';
import AppShell from '@/components/app/AppShell';
import { AppRuntime } from '@/components/app/AppRuntime';
import { CheckInProvider } from '@/components/app/CheckIn';
import HomePage from '@/components/pages/HomePage';
import MedsPage from '@/components/pages/MedsPage';
import LogPage from '@/components/pages/LogPage';
import ProfilePage from '@/components/pages/ProfilePage';
import ShopPage from '@/components/pages/ShopPage';
import WelcomePage from '@/components/pages/WelcomePage';
import ReminderOnboarding from '@/components/pages/ReminderOnboarding';
import MedicationForm from '@/components/forms/MedicationForm';
const AssetStudio = lazy(() => import('@/components/studio/AssetStudio'));
export default function App() {
  return (
    <BrowserRouter>
      <NativeRuntime />
      <AudioRuntime />
      <AppRuntime>
        <CheckInProvider>
          <Routes>
            <Route
              path="/studio"
              element={
                <Suspense fallback={<p style={{ padding: 30 }}>Opening asset studio…</p>}>
                  <AssetStudio />
                </Suspense>
              }
            />
            <Route path="/welcome" element={<WelcomePage />} />
            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route path="/welcome/reminders" element={<ReminderOnboarding />} />
              <Route path="/help" element={<HelpPage />} />
              <Route path="/routines" element={<RoutinesPage />} />
              <Route path="/meds" element={<MedsPage />} />
              <Route path="/meds/new" element={<MedicationForm key="new" />} />
              <Route path="/meds/:id/edit" element={<MedicationForm />} />
              <Route path="/log" element={<LogPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/music" element={<RecordPlayerPage />} />
              <Route path="/shop" element={<ShopPage />} />
              <Route path="/verify" element={<Navigate to="/" replace />} />
              <Route
                path="*"
                element={
                  <section className="panel empty-state">
                    <h1>This page wandered off.</h1>
                    <p>Your routine is still right here.</p>
                    <Link to="/" className="button primary">
                      Back to Today
                    </Link>
                  </section>
                }
              />
            </Route>
          </Routes>
        </CheckInProvider>
      </AppRuntime>
    </BrowserRouter>
  );
}
