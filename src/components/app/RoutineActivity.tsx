import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { type RoutineOccurrence } from '@/domain/routines';
import { routineActivityAvailable } from '@/domain/routineActivities';
import { roomEnvironment } from '@/domain/environment';
import type { RoutineStatus } from '@/types';
import RoutineDialog from './RoutineDialog';
import SceneErrorBoundary from '@/components/scene/SceneErrorBoundary';
const RoomGame = lazy(() => import('@/components/scene/RoomGame'));
const GardenCutscene = lazy(() => import('@/components/scene/GardenCutscene'));
const SceneCanvas = lazy(() => import('@/components/scene/SceneCanvas'));
export default function RoutineActivity({
  occurrence,
  close,
}: {
  occurrence: RoutineOccurrence;
  close: () => void;
}) {
  const returnTo = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    const previous = useAppStore.getState().previewPaused;
    const path = location.pathname;
    useAppStore.getState().setPreviewPaused(true);
    return () => {
      useAppStore.getState().setPreviewPaused(previous);
      // Restore after child dialogs finish their own unmount cleanup. Scheduling
      // in the close event can race their focus restoration on a busy renderer.
      requestAnimationFrame(() => {
        if (location.pathname !== path || document.querySelector('dialog[open]')) return;
        const target = returnTo.current?.isConnected
          ? returnTo.current
          : document.getElementById('for-you-title');
        target?.focus({ preventScroll: true });
      });
    };
  }, []);
  const data = useAppStore((s) => s.data);
  const [review, setReview] = useState(false),
    [error, setError] = useState(''),
    [paused, setPaused] = useState(false),
    [take, setTake] = useState(0);
  const reduced =
    data.preferences.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const activity = occurrence.routine.activity;
  const finish = () => setReview(true);
  const fallback = !routineActivityAvailable(data, activity) || data.preferences.staticScene;
  const save = (status: RoutineStatus) => {
    const result = useAppStore.getState().recordRoutine(occurrence.id, status);
    if (!result.ok) setError(result.error ?? 'Could not save. Please try again.');
    else {
      useAppStore
        .getState()
        .showToast(status === 'done' ? 'Routine recorded.' : 'Not today recorded.');
      close();
    }
  };
  const prompt = (
    <RoutineDialog key="break" title={occurrence.routine.title} close={finish}>
      <p>Take a moment in a way that feels comfortable. There’s no timer or target.</p>
      <p>Playing with Blobby doesn’t record your routine. You choose what to record afterwards.</p>
      <button className="button primary" onClick={finish}>
        Finish break
      </button>
      <button className="text-link" onClick={close}>
        Return without recording
      </button>
    </RoutineDialog>
  );
  if (!review) {
    if (fallback) return prompt;
    const loading = (
      <RoutineDialog title="Opening your activity" close={finish}>
        <p>You can return at any time.</p>
        <button className="button secondary" onClick={finish}>
          Finish break
        </button>
      </RoutineDialog>
    );
    let game;
    if (activity === 'sand' || activity === 'music')
      game = (
        <RoomGame
          kind={activity === 'sand' ? 'sand' : 'melody'}
          name={data.profile.petName}
          reduced={reduced}
          onFinish={finish}
        />
      );
    else if (activity === 'garden')
      game = (
        <GardenCutscene
          outfit={data.outfit}
          name={data.profile.petName}
          reduced={reduced}
          paused={paused}
          onPauseChange={() => setPaused((v) => !v)}
          onFinish={finish}
        />
      );
    else
      game = (
        <RoutineDialog
          title={activity === 'tea' ? 'Tea with ' + data.profile.petName : 'A restful moment'}
          close={finish}
        >
          <div className="routine-room">
            <SceneCanvas
              routinePreview
              clip={activity === 'tea' ? 'tea' : 'rest'}
              closeUp={false}
              paused={paused}
              reactionId={-1 - take}
              environment={roomEnvironment(new Date())}
            />
          </div>
          <p>
            {activity === 'tea'
              ? 'Enjoy a little company. You decide when your own routine is done.'
              : 'Rest a moment with Blobby, for as long as you like.'}
          </p>
          <div className="routine-actions">
            <button className="button primary" onClick={finish}>
              Finish break
            </button>
            <button
              className="button secondary"
              aria-pressed={paused}
              onClick={() => setPaused((v) => !v)}
            >
              {paused ? 'Resume animation' : 'Pause animation'}
            </button>
            <button className="text-link" onClick={close}>
              Return without recording
            </button>
          </div>
        </RoutineDialog>
      );
    return (
      <SceneErrorBoundary fallback={prompt}>
        <Suspense fallback={loading}>{game}</Suspense>
      </SceneErrorBoundary>
    );
  }
  return (
    <RoutineDialog key="review" title="How did your routine go?" close={close}>
      <p>{occurrence.routine.title}</p>
      <p>Choose what happened for you, separate from playing with Blobby.</p>
      <div className="routine-actions">
        <button className="button primary" onClick={() => save('done')}>
          Done
        </button>
        <button className="button secondary" onClick={() => save('skipped')}>
          Not today
        </button>
        <button
          className="button ghost"
          onClick={() => {
            setTake((t) => t + 1);
            setReview(false);
          }}
        >
          Back to activity
        </button>
      </div>
      <button className="text-link" onClick={close}>
        Return without recording
      </button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </RoutineDialog>
  );
}
