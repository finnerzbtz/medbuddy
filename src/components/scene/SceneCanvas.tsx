import { roomGameFor } from '@/domain/room';
import RoomGame from './RoomGame';
import type { FeedTarget } from '@/domain/feeding';
import { useAppStore } from '@/stores/appStore';
import { useCallback, useEffect, useRef, useState } from 'react';
import AssetScene, { useReducedMotion } from './AssetScene';
import { activityAvailable } from '@/domain/choreography';
import type { AnimationName } from '@/types';
import type { RoomEnvironmentState } from '@/domain/environment';
import GardenCutscene from './GardenCutscene';

export default function SceneCanvas({
  clip,
  closeUp,
  paused,
  reactionId,
  environment,
  feedingMode = false,
  routinePreview = false,
  onFeedTarget,
}: {
  clip: AnimationName;
  closeUp: boolean;
  paused: boolean;
  reactionId: number;
  environment: RoomEnvironmentState;
  feedingMode?: boolean;
  routinePreview?: boolean;
  onFeedTarget?: (target: FeedTarget) => void;
}) {
  const data = useAppStore((s) => s.data);
  const mounted = useRef(false);
  const reducedMotion = useReducedMotion();
  const gamePaused = useAppStore((s) => s.previewPaused);
  const [ready, setReady] = useState(false);
  const [take, setTake] = useState(0);
  const [gardenState, setGardenState] = useState({ id: '', phase: 'approach' });
  const id = `${clip}-${reactionId}-${take}`;
  const phase = gardenState.id === id ? gardenState.phase : 'approach';
  const gardening = clip === 'tend';
  const customGame = roomGameFor(clip, data.room);
  const interactive = gardening || !!customGame;
  const filming = interactive && phase === 'film';
  const reduced = reducedMotion || data.preferences.reducedMotion;
  useEffect(() => {
    if (!interactive) setGardenState({ id: '', phase: 'approach' });
  }, [interactive]);
  const arrived = useCallback(
    (activity: AnimationName) => {
      if (interactive && activity === clip)
        setGardenState((state) =>
          state.id === id && state.phase !== 'approach' ? state : { id, phase: 'film' },
        );
    },
    [clip, id, interactive],
  );
  const finishGarden = useCallback(() => {
    setGardenState({ id, phase: 'done' });
    const state = useAppStore.getState();
    state.setPreviewPaused(false);
    if (
      state.previewAnimation === null &&
      state.currentAnimation === clip &&
      state.reactionId === reactionId
    )
      state.react('recovering');
  }, [id, reactionId, clip]);
  const finishTea = useCallback(
    (activity: AnimationName) => {
      const state = useAppStore.getState();
      if (
        ['tea', 'feeding'].includes(activity) &&
        state.previewAnimation === null &&
        state.currentAnimation === activity &&
        state.reactionId === reactionId
      )
        state.react('idle');
    },
    [reactionId],
  );
  useEffect(() => {
    if (customGame) return;
    if (clip === 'feeding' ? !(reduced || paused) : clip !== 'tea' || !reduced || paused) return;
    const timer = window.setTimeout(() => finishTea(clip), 4000);
    return () => window.clearTimeout(timer);
  }, [clip, reduced, paused, finishTea, customGame]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // A real unmount releases the activity lock. React's development effect
      // replay remounts synchronously, so it must not cancel a newly chosen game.
      queueMicrotask(() => {
        if (mounted.current) return;
        const state = useAppStore.getState();
        if (
          ['tend', 'tea', 'feeding'].includes(clip) &&
          state.currentAnimation === clip &&
          state.reactionId === reactionId &&
          state.reactionUntil === -1
        )
          state.react('idle');
      });
    };
  }, [clip, reactionId]);
  return (
    <div
      className="live-scene"
      data-scene-ready={ready}
      data-garden-stage={gardening ? phase : undefined}
      data-room-game-stage={customGame ? phase : undefined}
    >
      <div
        role="img"
        aria-label={`${data.profile.petName} in the room. Activity: ${clip.replaceAll('_', ' ')}. ${environment.phase}. Lamp ${data.preferences.lampOn ? 'on' : 'off'}. Use the labelled room buttons for activities.`}
      >
        <AssetScene
          outfit={data.outfit}
          roomStyle={data.room}
          clip={interactive && phase === 'done' ? 'recovering' : clip}
          playing={!reduced && !paused && !filming}
          freezeCamera={filming}
          cosy
          environment={environment}
          lampOn={data.preferences.lampOn}
          onLampToggle={() => {
            if (routinePreview) return;
            const state = useAppStore.getState();
            const result = state.setPreference('lampOn', !state.data.preferences.lampOn);
            if (!result.ok) state.showToast(result.error!);
          }}
          loopJourney={!interactive && useAppStore.getState().previewAnimation !== null}
          onFeedTarget={feedingMode ? onFeedTarget : undefined}
          onActivityArrive={arrived}
          onActivityComplete={finishTea}
          onInteract={(activity) => {
            if (routinePreview || feedingMode || !activityAvailable(activity, data.hiddenGroups))
              return;
            useAppStore.getState().previewState(null);
            const state = useAppStore.getState();
            state.react(activity === 'rest' && clip === 'rest' ? 'idle' : activity);
          }}
          closeUp={closeUp}
          reactionId={reactionId + take}
          food={data.care.lastFood ?? 'apple'}
          onPet={() => {
            if (routinePreview || feedingMode) return;
            const result = useAppStore.getState().careForBlobby('pet');
            if (!result.ok) useAppStore.getState().showToast(result.error!);
          }}
          hiddenGroups={data.hiddenGroups}
          onReady={setReady}
          room
        />
      </div>
      {interactive && phase === 'approach' && (
        <div className="garden-approach" role="status">
          <span aria-hidden="true">✿</span> {data.profile.petName} is off to{' '}
          {customGame === 'sand'
            ? 'the Zen garden'
            : customGame === 'melody'
              ? 'the record player'
              : 'the bonsai'}
          …
        </div>
      )}
      {filming && customGame && (
        <RoomGame
          key={id}
          kind={customGame}
          name={data.profile.petName}
          reduced={reduced || paused}
          onFinish={finishGarden}
        />
      )}
      {filming && !customGame && (
        <GardenCutscene
          key={id}
          outfit={data.outfit}
          name={data.profile.petName}
          reduced={reduced}
          paused={gamePaused}
          onPauseChange={() => useAppStore.getState().setPreviewPaused(!gamePaused)}
          onFinish={finishGarden}
        />
      )}
      {interactive && phase === 'done' && (
        <button type="button" className="garden-replay" onClick={() => setTake((n) => n + 1)}>
          {customGame ? 'Play again ↗' : 'Visit the bonsai again ↗'}
        </button>
      )}
      {!ready && (
        <img
          className="scene-fallback-image"
          src="/assets-v2/room-preview.webp"
          alt="Preparing your little world"
        />
      )}
    </div>
  );
}
