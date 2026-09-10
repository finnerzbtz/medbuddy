import SoundControls from '@/components/app/SoundControls';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { checkInStreak, dateKey } from '@/domain/schedule';
import { useNow } from '@/components/app/AppRuntime';
export default function TopBar() {
  const data = useAppStore((s) => s.data),
    now = useNow();
  return (
    <header className="app-topbar">
      <Link className="brand" to="/">
        <span className="brand-icon">
          <span />
          <span />
        </span>
        reminduh<span className="brand-dot">.</span>
      </Link>
      <div className="topbar-right">
        <SoundControls />
        <Link to="/help" className="help-link">
          Help
        </Link>
        {!data.preferences.hideRewards && (
          <span
            aria-label={checkInStreak(data, dateKey(now)) + ' day check-in streak'}
            className="streak-badge"
            title="Consecutive days with at least one recorded dose, including skips."
          >
            <Sparkles aria-hidden="true" focusable="false" size={15} />
            <b>{checkInStreak(data, dateKey(now))}</b>
            <span>day check-in streak</span>
          </span>
        )}
        <Link to="/profile" aria-label="Open profile" className="profile-avatar">
          {data.profile.name.trim().slice(0, 1).toUpperCase() || 'B'}
        </Link>
      </div>
    </header>
  );
}
