import type { FC } from 'react';
import { useAppStore } from '@/stores/appStore';

const TopBar: FC = () => {
  const streak = useAppStore((state) => state.streak);

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 52,
        paddingLeft: 20,
        paddingRight: 20,
        paddingBottom: 8,
      }}
    >
      {/* Wordmark */}
      <span
        style={{
          fontFamily: "'Sora', sans-serif",
          fontSize: 18,
          fontWeight: 500,
          color: 'var(--text-primary)',
        }}
      >
        pill box
      </span>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Streak badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: 'rgba(212, 165, 116, 0.14)',
            borderRadius: 9999,
            padding: '4px 10px',
          }}
        >
          <span style={{ fontSize: 13 }}>🔥</span>
          <span
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--accent-amber)',
            }}
          >
            {streak}
          </span>
        </div>

        {/* Avatar */}
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'var(--glass-fill)',
            border: '1px solid var(--glass-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-muted)',
            }}
          >
            JD
          </span>
        </div>
      </div>
    </div>
  );
};

export default TopBar;
