import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '@/stores/appStore';
import { routinesForDay, type RoutineOccurrence } from '@/domain/routines';
import { dateKey, formatTime } from '@/domain/schedule';
import type { Result, RoutineStatus } from '@/types';
import { useNow } from './AppRuntime';
import RoutineActivity from './RoutineActivity';
import RoutineDialog from './RoutineDialog';
export function RoutineCard({
  occurrence,
  historical = false,
}: {
  occurrence: RoutineOccurrence;
  historical?: boolean;
}) {
  const { id, record, routine, schedule, override } = occurrence;
  const [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [activity, setActivity] = useState(false);
  const run = (result: Result, success: string) => {
    setError(result.ok ? '' : (result.error ?? 'Could not save.'));
    setMessage(result.ok ? success : '');
  };
  const save = (status: RoutineStatus) =>
    run(
      useAppStore.getState().recordRoutine(id, status),
      status === 'done' ? 'Routine recorded as done.' : 'Not today recorded.',
    );
  return (
    <article className="routine-card" aria-label={record?.title ?? routine.title}>
      <div>
        <h3>{record?.title ?? routine.title}</h3>
        <p>
          {record
            ? record.status === 'done'
              ? 'Done'
              : 'Not today'
            : historical
              ? 'Not recorded'
              : override?.laterAt
                ? 'Later today'
                : schedule?.time
                  ? formatTime(schedule.time)
                  : 'Any time'}
        </p>
      </div>
      {record ? (
        <div className="routine-actions">
          <button
            className="button ghost"
            onClick={() => run(useAppStore.getState().undoRoutine(id), 'Routine record removed.')}
            aria-label={'Undo ' + record.title}
          >
            Undo
          </button>
          <button
            className="text-link"
            onClick={() => save(record.status === 'done' ? 'skipped' : 'done')}
          >
            {record.status === 'done' ? 'Change to Not today' : 'Change to Done'}
          </button>
        </div>
      ) : (
        <div className="routine-actions">
          <button className="button primary" onClick={() => save('done')}>
            Done
          </button>
          <button className="button secondary" onClick={() => save('skipped')}>
            Not today
          </button>
          {!historical && (
            <button
              className="button ghost"
              onClick={() =>
                run(
                  useAppStore.getState().laterRoutine(id),
                  'Moved to Later today. This changes the list only; no alert is set.',
                )
              }
            >
              Later
            </button>
          )}
        </div>
      )}
      {!historical && !record && routine.activity && (
        <button
          className="text-link"
          onClick={(event) => {
            // Safari does not focus buttons on touch; retain a real return target.
            event.currentTarget.focus({ preventScroll: true });
            setActivity(true);
          }}
        >
          Take a break with {useAppStore.getState().data.profile.petName}
        </button>
      )}
      {message && (
        <p role="status" className="routine-message">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {activity && <RoutineActivity occurrence={occurrence} close={() => setActivity(false)} />}
    </article>
  );
}
export default function RoutinesToday() {
  const data = useAppStore((s) => s.data),
    now = useNow();
  const [error, setError] = useState(''),
    [small, setSmall] = useState<string[] | null>(null);
  const occurrences = routinesForDay(data, dateKey(now));
  const hidden = occurrences.filter((o) => !o.record && o.override?.hiddenForToday);
  const visible = occurrences.filter((o) => o.record || !o.override?.hiddenForToday);
  const regular = visible.filter((o) => !o.override?.laterAt || o.record),
    later = visible.filter((o) => o.override?.laterAt && !o.record);
  const hide = (ids: string[], value: boolean) => {
    const result = useAppStore.getState().hideRoutinesToday(ids, value);
    setError(result.ok ? '' : (result.error ?? 'Could not save.'));
    if (result.ok) setSmall(null);
  };
  const dismiss = () => {
    const result = useAppStore.getState().dismissRoutineIntroduction();
    if (!result.ok) setError(result.error ?? 'Could not save.');
  };
  return (
    <section className="panel routines-today" aria-labelledby="for-you-title">
      <div className="section-heading">
        <h2 id="for-you-title" tabIndex={-1}>
          For you
        </h2>
        <Link className="text-link" to="/routines">
          Manage routines
        </Link>
      </div>
      {!data.selfCare.introductionDismissed && (
        <div className="routine-introduction">
          <p>Optional moments for yourself. Start with one or two, or leave this empty.</p>
          <div className="routine-actions">
            <Link className="button secondary" to="/routines?welcome=1">
              Choose routines
            </Link>
            <button className="button ghost" onClick={dismiss}>
              Not now
            </button>
          </div>
        </div>
      )}
      {visible.some((o) => !o.record) && (
        <button
          className="text-link"
          onClick={() => setSmall(visible.filter((o) => !o.record).map((o) => o.id))}
        >
          Keep today small
        </button>
      )}
      {regular.map((o) => (
        <RoutineCard key={o.id} occurrence={o} />
      ))}
      {later.length > 0 && (
        <div className="routines-later">
          <h3>Later today</h3>
          <p className="small muted">A place in the list, without an alert.</p>
          {later.map((o) => (
            <RoutineCard key={o.id} occurrence={o} />
          ))}
        </div>
      )}
      {!visible.length && (
        <p>
          {hidden.length
            ? 'Your optional plan is tucked away for today.'
            : 'No optional routines today.'}
        </p>
      )}
      {hidden.length > 0 && (
        <button
          className="button secondary"
          onClick={() =>
            hide(
              hidden.map((o) => o.id),
              false,
            )
          }
        >
          Restore today’s routines ({hidden.length})
        </button>
      )}
      {small && (
        <RoutineDialog title="Keep today small" close={() => setSmall(null)}>
          <p>
            Choose optional routines to tuck away just for today. Your medication check-ins and
            reminders stay as they are.
          </p>
          <div className="routine-small-list">
            {visible
              .filter((o) => !o.record)
              .map((o) => (
                <label key={o.id}>
                  <input
                    type="checkbox"
                    checked={small.includes(o.id)}
                    onChange={(e) =>
                      setSmall((ids) =>
                        e.target.checked ? [...ids!, o.id] : ids!.filter((id) => id !== o.id),
                      )
                    }
                  />
                  {o.routine.title}
                </label>
              ))}
          </div>
          <p>You can restore them today. Their repeating schedules won’t change.</p>
          <div className="routine-actions">
            <button
              className="button primary"
              disabled={!small.length}
              onClick={() => hide(small, true)}
            >
              Hide {small.length} for today
            </button>
            <button className="button secondary" onClick={() => setSmall(null)}>
              Cancel
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </RoutineDialog>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
