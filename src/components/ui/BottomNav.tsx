import type { FC } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Pill, Calendar, CircleCheck, type LucideIcon } from 'lucide-react';

interface NavTab {
  label: string;
  path: string;
  icon: LucideIcon;
}

const tabs: NavTab[] = [
  { label: 'Home', path: '/', icon: Home },
  { label: 'Meds', path: '/meds', icon: Pill },
  { label: 'Log', path: '/log', icon: Calendar },
  { label: 'Verify', path: '/verify', icon: CircleCheck },
];

const BottomNav: FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav
      style={{
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'flex-start',
        paddingTop: 8,
        paddingLeft: 16,
        paddingRight: 16,
        paddingBottom: 28,
        background:
          'linear-gradient(to bottom, transparent 0%, #1A1612DD 30%, #1A1612 100%)',
      }}
    >
      {tabs.map((tab) => {
        const isActive = location.pathname === tab.path;
        const color = isActive
          ? '#A3B18A'
          : 'rgba(245, 240, 232, 0.25)';
        const IconComponent = tab.icon;

        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 12px',
            }}
          >
            <IconComponent size={22} color={color} />
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 11,
                fontWeight: 500,
                color,
              }}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

export default BottomNav;
