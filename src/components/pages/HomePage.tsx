import { lazy, Suspense } from 'react';
import type { FC } from 'react';
import TopBar from '@/components/ui/TopBar';
import BottomNav from '@/components/ui/BottomNav';
import PillChip from '@/components/ui/PillChip';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SceneErrorBoundary from '@/components/scene/SceneErrorBoundary';
import AnimationControls from '@/components/scene/AnimationControls';
import { useAppStore } from '@/stores/appStore';

const SceneCanvas = lazy(() => import('@/components/scene/SceneCanvas'));

const HomePage: FC = () => {
  const streak = useAppStore((state) => state.streak);
  const medications = useAppStore((state) => state.medications);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      <TopBar />

      {/* Streak section */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '12px 0 8px',
        }}
      >
        <span
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--text-muted)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          DAY STREAK
        </span>
        <span
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 96,
            fontWeight: 700,
            color: '#FFFFFF',
            lineHeight: 1,
            textShadow: '0 0 40px rgba(212, 165, 116, 0.25)',
          }}
        >
          {streak}
        </span>
      </div>

      {/* Today's doses */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--text-muted)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            textAlign: 'center',
          }}
        >
          TODAY'S DOSES
        </span>
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: 8,
            overflow: 'hidden',
            padding: '0 16px',
          }}
        >
          {medications.map((med) => (
            <PillChip
              key={med.id}
              name={med.name}
              time={med.time}
              color={med.color}
            />
          ))}
        </div>
      </div>

      {/* 3D Room Diorama */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
        }}
      >
        <SceneErrorBoundary>
          <Suspense
            fallback={
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: 'var(--text-muted)',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                }}
              >
                Loading room...
              </div>
            }
          >
            <SceneCanvas />
          </Suspense>
        </SceneErrorBoundary>
        <AnimationControls />
      </div>

      {/* Log a Dose CTA */}
      <div style={{ padding: '0 16px 8px 16px' }}>
        <PrimaryButton>Log a Dose ✦</PrimaryButton>
      </div>

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: '#A3B18A33',
          boxShadow: '0 0 8px rgba(163, 177, 138, 0.12)',
        }}
      />

      <BottomNav />
    </div>
  );
};

export default HomePage;
