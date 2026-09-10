import './companion-controls.css';
import LeafWalletButton from '@/components/shop/LeafWallet';
import BlobbyWisdom from './BlobbyWisdom';
import { DEFAULT_ROOM, roomGameFor } from '@/domain/room';
import { RoomStill } from '@/components/shop/RoomArt';
import { lazy, Suspense, useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import FeedingTray from '@/components/shop/FeedingTray';
import type { FeedTarget } from '@/domain/feeding';
import type { FoodId } from '@/types';
import {
  SlidersHorizontal,
  Grid2X2,
  ShoppingBag,
  Armchair,
  Music2,
  Waves,
  BedDouble,
  LampDesk,
  Sun,
  Apple,
  ArrowRight,
  Check,
  ChevronDown,
  Code2,
  Coffee,
  Flower2,
  CloudSun,
  CircleDot,
  Heart,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Shirt,
  Sparkles,
  X,
} from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import {
  careForDay,
  presentedCompanionMood,
  companionCheckIn,
  FOODS,
  friendship,
  STATES,
  treatsAvailable,
} from '@/domain/companion';
import { roomEnvironment } from '@/domain/environment';
import type { AnimationName } from '@/types';
import {
  activityAvailable,
  activityDuration,
  ROOM_ACTIVITIES,
  MOOD_LOOKS,
} from '@/domain/choreography';
import { dateKey, formatDay, formatTime } from '@/domain/schedule';
import SceneErrorBoundary from '@/components/scene/SceneErrorBoundary';
import { useNow } from './AppRuntime';
import { useCheckIn } from './CheckIn';
const SceneCanvas = lazy(() => import('@/components/scene/SceneCanvas'));
const RoomGame = lazy(() => import('@/components/scene/RoomGame'));
const idleSequence: AnimationName[] = [
  'idle',
  'curious',
  'idle',
  'stretch',
  'tea',
  'walk_to_cushion',
  'window',
  'ball',
  'wave',
];

export default function CompanionPanel() {
  const [params] = useSearchParams();
  const initialFood = FOODS.find((food) => food.id === params.get('feed'))?.id;
  const scene = useRef<HTMLDivElement>(null);
  const feedTarget = useRef<FeedTarget | null>(null);
  const onFeedTarget = useCallback((target: FeedTarget) => {
    feedTarget.current = target;
    const marker = scene.current?.querySelector<HTMLElement>('.feed-target');
    if (marker) {
      marker.style.left = target.x + 'px';
      marker.style.top = target.y + 'px';
      marker.style.width = target.width + 'px';
      marker.style.height = target.height + 'px';
    }
  }, []);
  const data = useAppStore((s) => s.data),
    reaction = useAppStore((s) => s.currentAnimation),
    reactionUntil = useAppStore((s) => s.reactionUntil),
    reactionId = useAppStore((s) => s.reactionId),
    preview = useAppStore((s) => s.previewAnimation),
    previewPaused = useAppStore((s) => s.previewPaused);
  const paused = previewPaused || data.preferences.pauseScene;
  const now = useNow();
  const environment = useMemo(() => roomEnvironment(now), [now]);
  const openCheckIn = useCheckIn();
  const due = useMemo(() => companionCheckIn(data, now), [data, now]);
  const snooze = due && data.reminders[due.id]?.snoozedUntil;
  const snoozed = !!snooze && Date.parse(snooze) > +now;
  const pastCheckIn = !!due && due.date < dateKey(now);
  const [cappedPreview, setCappedPreview] = useState(false);
  const mood = useMemo(
    () =>
      presentedCompanionMood(
        data,
        now,
        import.meta.env.DEV && cappedPreview ? 'capped-preview' : 'baseline',
      ),
    [data, now, cappedPreview],
  );
  const [speech, setSpeech] = useState(false);
  const [pantry, setPantry] = useState(!!initialFood),
    [cheats, setCheats] = useState(false),
    [roomTools, setRoomTools] = useState(false),
    [activities, setActivities] = useState(false),
    [code, setCode] = useState(''),
    [error, setError] = useState(''),
    [closeUp, setCloseUp] = useState(false),
    [idleStep, setIdleStep] = useState(0),
    [osReduced, setOsReduced] = useState(
      () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
  const reduced = data.preferences.reducedMotion || osReduced;
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setOsReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (
      pantry ||
      preview ||
      reactionUntil ||
      reduced ||
      paused ||
      data.preferences.staticScene ||
      !['idle', 'happy'].includes(mood)
    ) {
      setIdleStep(0);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      if (!document.hidden)
        timer = setTimeout(
          () => setIdleStep((step) => (step + 1) % idleSequence.length),
          activityDuration(idleSequence[idleStep]),
        );
    };
    schedule();
    document.addEventListener('visibilitychange', schedule);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [
    pantry,
    preview,
    reactionUntil,
    reduced,
    paused,
    mood,
    data.preferences.staticScene,
    idleStep,
  ]);
  const idleActivity = idleStep
    ? roomGameFor(idleSequence[idleStep], data.room)
      ? 'curious'
      : idleSequence[idleStep]
    : mood;
  const selected = preview ?? (reactionUntil ? reaction : idleActivity);
  const clip = activityAvailable(selected, data.hiddenGroups) ? selected : mood;
  useEffect(() => {
    setSpeech(!!(preview || reactionUntil) && !['tend', 'tea', 'feeding'].includes(clip));
    const timeout = setTimeout(() => setSpeech(false), 4500);
    return () => clearTimeout(timeout);
  }, [preview, reactionId, reactionUntil, clip]);
  const customGame = roomGameFor(clip, data.room);
  const baseState = STATES.find((s) => s.id === clip)!;
  const state = customGame
    ? { ...baseState, label: customGame === 'sand' ? 'A little Zen' : 'Mixtape time' }
    : baseState;
  const bond = friendship(data),
    treats = treatsAvailable(data);
  const isFeeding = reactionUntil !== 0 && reaction === 'feeding';
  const hasCustomRoom = Object.entries(data.room).some(
    ([slot, value]) => value !== DEFAULT_ROOM[slot as keyof typeof DEFAULT_ROOM],
  );
  const sceneImage = hasCustomRoom ? (
    <RoomStill room={data.room} name={data.profile.petName} />
  ) : (
    <img
      className="scene-fallback-image"
      src="/assets-v2/room-preview.webp"
      alt={data.profile.petName + ' in a cosy room'}
    />
  );
  const interact = (kind: 'pet' | 'play') => {
    const result = useAppStore.getState().careForBlobby(kind);
    if (!result.ok) useAppStore.getState().showToast(result.error!);
  };
  const runCode = (value: string) => {
    const clean = value.trim().toLowerCase().replace(/^\//, '');
    if (clean === 'reset' || clean === 'auto') {
      useAppStore.getState().previewState(null);
      setError('');
      return;
    }
    const match = STATES.find((s) => s.code === clean || s.id === clean);
    if (!match) {
      setError('Try /happy, /poorly, /feed or choose a state below.');
      return;
    }
    if (!activityAvailable(match.id, data.hiddenGroups)) {
      setError('Show that object in My Blobby to use this activity.');
      return;
    }
    useAppStore.getState().previewState(match.id);
    setError('');
    setCode('/' + match.code);
  };
  return (
    <section
      className="companion-card"
      aria-label="Your companion"
      data-state={clip}
      data-time-of-day={environment.phase}
      data-lamp-on={data.preferences.lampOn}
      style={
        {
          '--mood-accent': MOOD_LOOKS[clip].accent,
          '--mood-sky': environment.sky,
          '--room-backdrop': environment.backdrop,
        } as React.CSSProperties
      }
    >
      <div className="companion-caption">
        <div>
          <h2>{data.profile.petName}</h2>
          <span className="companion-mood" title={state.message}>
            <span className="mood-dot" />
            {clip === 'rest' ? 'Sleeping' : state.label}
          </span>
        </div>
        <div className="companion-toolbar">
          <button
            className="icon-button scene-zoom"
            aria-label={paused ? 'Resume room animation' : 'Pause room animation'}
            aria-pressed={paused}
            onClick={() => {
              const store = useAppStore.getState();
              const result = store.setPreference('pauseScene', !paused);
              if (!result.ok) store.showToast(result.error!);
              if (paused) store.setPreviewPaused(false);
            }}
          >
            {paused ? (
              <Play aria-hidden="true" focusable="false" size={19} />
            ) : (
              <Pause aria-hidden="true" focusable="false" size={19} />
            )}
            <span>{paused ? 'Resume' : 'Pause'}</span>
          </button>
          <button
            className="icon-button scene-zoom"
            aria-label="Room options"
            aria-expanded={roomTools}
            aria-controls="room-tools"
            onClick={() => setRoomTools(!roomTools)}
          >
            <SlidersHorizontal aria-hidden="true" size={19} />
          </button>
        </div>
      </div>
      {due && !preview && (
        <div className="companion-checkin" data-snoozed={snoozed}>
          <div
            className="companion-checkin-copy"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <p id="companion-checkin-reason">
              {snoozed
                ? 'Check-in snoozed until ' +
                  new Date(snooze!).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                : ['worried', 'sick', 'critical'].includes(mood)
                  ? data.profile.petName +
                    (mood === 'worried'
                      ? ' is sad — a check-in is missing.'
                      : ' is feeling low — a check-in is missing.')
                  : 'Your medication check-in is waiting.'}
            </p>
            <strong>{due.name}</strong>
            <span>
              {pastCheckIn ? formatDay(due.date, true) + ' · ' : ''}
              {formatTime(due.time)} · {due.dosage}
            </span>
          </div>
          <button
            className="button primary companion-checkin-button"
            aria-describedby="companion-checkin-reason"
            onClick={() => openCheckIn(due.id)}
          >
            {pastCheckIn ? 'Review missed check-in' : 'Review dose'}
            <ArrowRight aria-hidden="true" focusable="false" size={16} />
          </button>
        </div>
      )}
      {roomTools && (
        <div
          id="room-tools"
          className="room-tools"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setRoomTools(false);
              document.querySelector<HTMLButtonElement>('[aria-controls="room-tools"]')?.focus();
            }
          }}
        >
          <div className="room-controls" role="group" aria-label="Room controls">
            <button
              className="icon-button scene-zoom"
              aria-label={clip === 'rest' ? 'Wake Blobby' : 'Put Blobby to bed'}
              title={clip === 'rest' ? 'Wake Blobby' : 'Put Blobby to bed'}
              aria-pressed={clip === 'rest'}
              disabled={!activityAvailable('rest', data.hiddenGroups)}
              onClick={() => {
                const store = useAppStore.getState();
                store.previewState(null);
                store.react(clip === 'rest' ? 'idle' : 'rest');
              }}
            >
              {clip === 'rest' ? (
                <Sun aria-hidden="true" focusable="false" size={19} />
              ) : (
                <BedDouble aria-hidden="true" focusable="false" size={19} />
              )}
              <span>{clip === 'rest' ? 'Wake' : 'Bed'}</span>
            </button>
            <button
              className="icon-button scene-zoom lamp-switch"
              aria-label={data.preferences.lampOn ? 'Turn lamp off' : 'Turn lamp on'}
              title={data.preferences.lampOn ? 'Turn lamp off' : 'Turn lamp on'}
              aria-pressed={data.preferences.lampOn}
              disabled={data.hiddenGroups.includes('Lamp')}
              onClick={() => {
                const store = useAppStore.getState();
                const result = store.setPreference('lampOn', !store.data.preferences.lampOn);
                if (!result.ok) store.showToast(result.error!);
              }}
            >
              <LampDesk aria-hidden="true" focusable="false" size={19} />
              <span>Lamp</span>
            </button>
            <button
              className="icon-button scene-zoom"
              aria-label={closeUp ? 'Show whole room' : 'Get closer to Blobby'}
              aria-pressed={closeUp}
              onClick={() => setCloseUp(!closeUp)}
            >
              {closeUp ? (
                <Minimize2 aria-hidden="true" focusable="false" size={19} />
              ) : (
                <Maximize2 aria-hidden="true" focusable="false" size={19} />
              )}
              <span>{closeUp ? 'Room' : 'Closer'}</span>
            </button>
          </div>
          <div className="room-tools-links">
            <Link to="/shop?tab=outfits" className="text-link">
              <Shirt aria-hidden="true" size={17} /> Change look
            </Link>
            <Link to="/shop?tab=room" className="text-link">
              <Armchair aria-hidden="true" size={17} /> Decorate room
            </Link>
          </div>
        </div>
      )}
      {!data.preferences.hideRewards && (
        <div className="friendship-row">
          <Heart aria-hidden="true" focusable="false" size={15} />
          <strong>Level {bond.level}</strong>
          <div
            className="friendship-track"
            role="progressbar"
            aria-label="Friendship to next level"
            aria-valuenow={bond.progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: bond.progress + '%' }} />
          </div>
        </div>
      )}
      <div id="blobby-room" ref={scene} className={'home-scene' + (closeUp ? ' close-up' : '')}>
        {data.preferences.staticScene ? (
          sceneImage
        ) : (
          <SceneErrorBoundary fallback={sceneImage}>
            <Suspense fallback={sceneImage}>
              <SceneCanvas
                clip={clip}
                closeUp={closeUp}
                paused={paused}
                reactionId={reactionId}
                environment={environment}
                feedingMode={pantry}
                onFeedTarget={onFeedTarget}
              />
            </Suspense>
          </SceneErrorBoundary>
        )}
        {data.preferences.staticScene && customGame && (
          <Suspense fallback={null}>
            <RoomGame
              key={clip + reactionId}
              kind={customGame}
              name={data.profile.petName}
              reduced
              onFinish={() => {
                const s = useAppStore.getState();
                s.previewState(null);
                s.react('recovering');
              }}
            />
          </Suspense>
        )}
        {preview && (
          <div className="preview-badge">
            <Code2 aria-hidden="true" focusable="false" size={13} /> Preview: {state.label}
            <button
              aria-label="Exit state preview"
              onClick={() => useAppStore.getState().previewState(null)}
            >
              <X aria-hidden="true" focusable="false" size={13} />
            </button>
          </div>
        )}
      </div>
      <BlobbyWisdom
        message={speech ? state.message : undefined}
        fallback={state.message}
        suspended={pantry || !!customGame || ['tend', 'tea', 'feeding'].includes(clip)}
      />
      {pantry && (
        <FeedingTray
          scene={scene}
          target={feedTarget}
          busy={isFeeding}
          initialFood={initialFood as FoodId | undefined}
          close={() => {
            setPantry(false);
            document.querySelector<HTMLButtonElement>('.feed-button')?.focus();
          }}
        />
      )}
      <div className="companion-actions" role="group" aria-label="Care and activities">
        <button
          className={'button scene-button feed-button' + (pantry ? ' selected' : '')}
          aria-expanded={pantry}
          aria-controls="blobby-pantry"
          onClick={() => {
            if (!pantry && !isFeeding) {
              useAppStore.getState().previewState(null);
              useAppStore.getState().react('idle');
            }
            setPantry(!pantry);
          }}
        >
          <Apple aria-hidden="true" focusable="false" size={19} />
          <span className="action-label">
            Feed <span className="treat-count">{treats}</span>
          </span>
        </button>
        <button className="button scene-button" onClick={() => interact('pet')}>
          <Heart aria-hidden="true" focusable="false" size={19} />
          <span>Cuddle</span>
        </button>
        <button className="button scene-button" onClick={() => interact('play')}>
          <Sparkles aria-hidden="true" focusable="false" size={19} />
          <span>Play</span>
        </button>
        <button
          className="button scene-button"
          aria-expanded={activities}
          aria-controls="room-activities"
          onClick={() => setActivities(!activities)}
        >
          <Grid2X2 aria-hidden="true" size={19} />
          <span>Activities</span>
        </button>
      </div>
      <div
        id="room-activities"
        className="room-activities-drawer"
        hidden={!activities}
        role="group"
        aria-label="Room activities"
      >
        {ROOM_ACTIVITIES.map((activity) => {
          const Icon = {
            tea: data.room.table === 'record_player' ? Music2 : Coffee,
            tend: data.room.garden === 'sand_garden' ? Waves : Flower2,
            window: CloudSun,
            ball: CircleDot,
          }[activity.id];
          const label = {
            tea: data.room.table === 'record_player' ? 'Music' : 'Tea',
            tend: data.room.garden === 'sand_garden' ? 'Zen' : 'Garden',
            window: 'Window',
            ball: 'Ball',
          }[activity.id];
          return (
            <button
              key={activity.id}
              className="button scene-button room-activity-button"
              data-room-activity={activity.id}
              aria-label={
                label +
                ': ' +
                (activity.id === 'tea' && data.room.table === 'record_player'
                  ? 'Open record player'
                  : activity.id === 'tend' && data.room.garden === 'sand_garden'
                    ? 'Rake the Zen garden'
                    : activity.label)
              }
              aria-pressed={clip === activity.id}
              disabled={!activityAvailable(activity.id, data.hiddenGroups)}
              title={
                !activityAvailable(activity.id, data.hiddenGroups)
                  ? 'Show this object in My Blobby'
                  : activity.id === 'tea' && data.room.table === 'record_player'
                    ? 'Open record player'
                    : activity.id === 'tend' && data.room.garden === 'sand_garden'
                      ? 'Rake the Zen garden'
                      : activity.label
              }
              onClick={() => {
                useAppStore.getState().previewState(null);
                useAppStore.getState().react(activity.id);
              }}
            >
              <Icon aria-hidden="true" focusable="false" size={19} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      <div className="companion-footer">
        {!data.preferences.hideRewards && <LeafWalletButton compact />}
        <div className="companion-shop-links">
          <Link to="/shop" className="shop-link">
            <ShoppingBag aria-hidden="true" size={15} /> Shop
          </Link>
        </div>
        <button
          className="cheat-toggle"
          aria-expanded={cheats}
          aria-controls="blobby-cheats"
          onClick={() => {
            setCheats(!cheats);
            if (cheats) setCappedPreview(false);
          }}
        >
          <Code2 aria-hidden="true" focusable="false" size={14} /> Cheat codes{' '}
          <ChevronDown aria-hidden="true" focusable="false" size={13} />
        </button>
      </div>
      {cheats && (
        <div id="blobby-cheats" className="cheat-panel">
          <div className="cheat-heading">
            <strong>Mood preview</strong>
            {import.meta.env.DEV && (
              <label className="routine-preview-toggle">
                <input
                  type="checkbox"
                  checked={cappedPreview}
                  onChange={(e) => {
                    setCappedPreview(e.target.checked);
                    useAppStore.getState().previewState(null);
                  }}
                />
                Research preview: cap sadness at Missing you
              </label>
            )}
            <button
              className="text-link"
              onClick={() => {
                useAppStore.getState().previewState(null);
                setError('');
                setCappedPreview(false);
              }}
            >
              <RotateCcw aria-hidden="true" focusable="false" size={13} /> Exit preview
            </button>
          </div>
          <form
            className="cheat-bar"
            onSubmit={(e) => {
              e.preventDefault();
              runCode(code);
            }}
          >
            <Code2 aria-hidden="true" focusable="false" size={16} />
            <input
              aria-label="Cheat code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="/happy, /poorly, /feed…"
              autoComplete="off"
            />
            <button className="button primary" type="submit">
              Preview
            </button>
          </form>
          <div className="state-chips">
            {STATES.map((s) => (
              <button key={s.id} aria-pressed={preview === s.id} onClick={() => runCode(s.code)}>
                {s.label}
              </button>
            ))}
          </div>
          <button
            className="button secondary full"
            onClick={() => useAppStore.getState().previewCelebration()}
          >
            <Sparkles aria-hidden="true" focusable="false" size={17} /> Preview check-in celebration
          </button>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="cheat-note">
            <p>Preview only. Your check-ins, treats and friendship stay unchanged.</p>
            <button
              className="icon-button"
              aria-label={paused ? 'Play state animation' : 'Pause state animation'}
              onClick={() => useAppStore.getState().setPreviewPaused(!paused)}
            >
              {paused ? (
                <Play aria-hidden="true" focusable="false" size={16} />
              ) : (
                <Pause aria-hidden="true" focusable="false" size={16} />
              )}
            </button>
          </div>
          {(reduced || data.preferences.staticScene) && (
            <p className="small muted">
              {data.preferences.staticScene
                ? 'Still-image mode is on.'
                : 'Reduced motion is on; states show a still pose.'}{' '}
              <Link to="/profile#accessibility">Motion settings</Link>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export function CompanionGoals() {
  const data = useAppStore((s) => s.data);
  const now = useNow();
  const today = careForDay(data, dateKey(now));
  const goals = [
    { name: 'Feed', done: today.feeds > 0, icon: Apple },
    { name: 'Cuddle', done: today.petted, icon: Heart },
    { name: 'Play', done: today.played, icon: Sparkles },
  ];
  const complete = goals.filter((g) => g.done).length;
  if (data.preferences.hideRewards) return null;
  return (
    <details className="care-goals care-details">
      <summary>
        <span>Blobby’s daily care</span>
        <span>{complete}/3</span>
      </summary>
      <ul>
        {goals.map(({ name, done, icon: Icon }) => (
          <li key={name} className={done ? 'complete' : ''}>
            <span className="ritual-icon">
              {done ? (
                <Check aria-hidden="true" focusable="false" size={17} />
              ) : (
                <Icon aria-hidden="true" focusable="false" size={17} />
              )}
            </span>
            <span>{name}</span>
            <small className="visually-hidden">{done ? 'Done' : 'Not yet'}</small>
          </li>
        ))}
      </ul>
    </details>
  );
}
