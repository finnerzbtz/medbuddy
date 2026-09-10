import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';
import { Check, Heart, Leaf, Sparkles, Star } from 'lucide-react';
import { useAppStore, type CheckInMoment } from '@/stores/appStore';
import { useReducedMotion } from './useReducedMotion';
import SceneErrorBoundary from '@/components/scene/SceneErrorBoundary';
import './dose-celebration.css';

const AssetScene = lazy(() => import('@/components/scene/AssetScene'));
const DURATION = 4200;
const colours = ['#e3b459', '#b28fc7', '#86b69c', '#e59b91', '#f4d887', '#8bbac5'];
const confetti = Array.from({ length: 64 }, (_, i) => {
  const side = i % 2;
  return {
    left: side ? '86%' : '14%',
    '--x': `${(side ? -1 : 1) * (5 + ((i * 17) % 72))}vw`,
    '--rise': `${-28 - ((i * 13) % 42)}vh`,
    '--fall': `${32 + ((i * 7) % 26)}vh`,
    '--spin': `${(side ? -1 : 1) * (210 + ((i * 53) % 480))}deg`,
    '--delay': `${120 + (i % 12) * 38}ms`,
    '--duration': `${2400 + ((i * 31) % 620)}ms`,
    background: colours[i % colours.length],
    borderRadius: i % 4 === 0 ? '50%' : '2px',
    width: i % 3 === 0 ? '9px' : '7px',
    height: i % 4 === 0 ? '9px' : '15px',
  } as CSSProperties;
});

/** Decorative only. The persistent toast owns confirmation, announcement and Undo. */
export default function DoseCelebration() {
  const moment = useAppStore((s) => s.celebration);
  const preferences = useAppStore((s) => s.data.preferences);
  const reduced = useReducedMotion();
  const location = useLocation();
  const shownOn = useRef(location.key);
  const calm =
    reduced ||
    preferences.reducedMotion ||
    preferences.staticScene ||
    preferences.pauseScene ||
    preferences.hideRewards;
  useEffect(() => {
    if (!moment) {
      shownOn.current = location.key;
      return;
    }
    const dismiss = () => useAppStore.getState().dismissCelebration(moment.id);
    if (calm || document.hidden || shownOn.current !== location.key) {
      dismiss();
      return;
    }
    const timer = window.setTimeout(dismiss, DURATION);
    // Any next action skips the flourish without swallowing the action or moving focus.
    window.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('keydown', dismiss, true);
    window.addEventListener('wheel', dismiss, { passive: true });
    const hide = () => {
      if (document.hidden) dismiss();
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', dismiss, true);
      window.removeEventListener('keydown', dismiss, true);
      window.removeEventListener('wheel', dismiss);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [moment, calm, location.key]);
  return moment && !calm ? <CelebrationVisual key={moment.id} moment={moment} /> : null;
}

function CelebrationVisual({ moment }: { moment: CheckInMoment }) {
  const outfit = useAppStore((s) => s.data.outfit);
  const name = useAppStore((s) => s.data.profile.petName);
  const [ready, setReady] = useState(false);
  return (
    <div className="dose-celebration" aria-hidden="true" data-all-done={moment.allDone}>
      <div className="dose-celebration-wash" />
      <div className="dose-confetti">
        {confetti.map((style, i) => (
          <span key={i} style={style}>
            <i />
          </span>
        ))}
      </div>
      <div className="dose-celebration-stage">
        <div className="dose-celebration-halo" />
        <div className="dose-celebration-orbit">
          <Star className="celebration-star star-one" />
          <Sparkles className="celebration-star star-two" />
          <Heart className="celebration-heart heart-one" />
          <Heart className="celebration-heart heart-two" />
        </div>
        <div className="dose-celebration-blobby" data-ready={ready}>
          <div className="dose-celebration-seal">
            <Check strokeWidth={2.5} />
          </div>
          <SceneErrorBoundary fallback={<span />}>
            <Suspense fallback={null}>
              <AssetScene
                outfit={outfit}
                clip="celebrating"
                playing
                presentation="celebration"
                onReady={setReady}
              />
            </Suspense>
          </SceneErrorBoundary>
        </div>
        <div className="dose-celebration-copy">
          <span className="dose-celebration-tick">
            <Check size={18} strokeWidth={2.5} />
          </span>
          <h2>{moment.title}</h2>
          {moment.leaves > 0 && (
            <span className="celebration-leaves">
              <Leaf size={19} /> +{moment.leaves} leaves
            </span>
          )}
          <p>
            {moment.doseId === null
              ? 'Your doses haven’t changed.'
              : moment.allDone
                ? 'Every check-in, done for today.'
                : `${name}’s cheering you on.`}
          </p>
        </div>
      </div>
    </div>
  );
}
