import { NavLink } from 'react-router-dom';
import { House, Pill, CalendarDays, Heart } from 'lucide-react';
const tabs = [
  { path: '/', name: 'Today', icon: House },
  { path: '/meds', name: 'Medications', icon: Pill },
  { path: '/log', name: 'History', icon: CalendarDays },
  { path: '/profile', name: 'My Blobby', icon: Heart },
];
export default function BottomNav() {
  return (
    <nav className="app-navigation" aria-label="Main navigation">
      {tabs.map((tab) => (
        <NavLink
          key={tab.path}
          to={tab.path}
          end={tab.path === '/'}
          className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
        >
          <tab.icon aria-hidden="true" focusable="false" size={21} strokeWidth={1.7} />
          <span>{tab.name}</span>
        </NavLink>
      ))}
    </nav>
  );
}
