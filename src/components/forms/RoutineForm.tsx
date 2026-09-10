import { useId, useState, type FormEvent } from 'react';
import type { Routine, RoutineInput } from '@/types';
import { dateKey, addDays } from '@/domain/schedule';
import { ROUTINE_CATEGORIES } from '@/domain/routines';
import { CATEGORY_NAMES, ACTIVITY_NAMES } from '@/domain/routineTemplates';
import { useAppStore } from '@/stores/appStore';
import RoutineDialog from '@/components/app/RoutineDialog';
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export default function RoutineForm({
  routine,
  template,
  close,
}: {
  routine?: Routine;
  template?: Partial<RoutineInput>;
  close: () => void;
}) {
  const id = useId(),
    [error, setError] = useState('');
  const schedule = routine?.schedules.at(-1);
  const [value, setValue] = useState<RoutineInput>({
    title: routine?.title ?? template?.title ?? '',
    category: routine?.category ?? template?.category ?? 'rest',
    activity: routine?.activity ?? template?.activity,
    days: schedule?.days ?? [0, 1, 2, 3, 4, 5, 6],
    time: schedule?.time,
    startDate: dateKey(),
  });
  const set = <K extends keyof RoutineInput>(key: K, v: RoutineInput[K]) =>
    setValue((previous) => ({ ...previous, [key]: v }));
  const save = (e: FormEvent) => {
    e.preventDefault();
    const result = useAppStore.getState().saveRoutine(value, routine?.id);
    if (!result.ok) setError(result.error ?? 'Could not save this routine.');
    else {
      useAppStore.getState().showToast(routine ? 'Routine updated.' : 'Routine added.');
      close();
    }
  };
  return (
    <RoutineDialog title={routine ? 'Edit routine' : 'Add a routine'} close={close}>
      <form className="stack routine-form" onSubmit={save}>
        <div className="field">
          <label htmlFor={id + '-title'}>Routine name</label>
          <input
            id={id + '-title'}
            value={value.title}
            onChange={(e) => set('title', e.target.value)}
            required
            maxLength={80}
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor={id + '-category'}>Category</label>
          <select
            id={id + '-category'}
            value={value.category}
            onChange={(e) => set('category', e.target.value as RoutineInput['category'])}
          >
            {ROUTINE_CATEGORIES.map((c) => (
              <option value={c} key={c}>
                {CATEGORY_NAMES[c]}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="routine-weekdays">
          <legend>Days</legend>
          {[1, 2, 3, 4, 5, 6, 0].map((day) => (
            <label key={day}>
              <input
                type="checkbox"
                checked={value.days.includes(day)}
                onChange={(e) =>
                  set(
                    'days',
                    e.target.checked ? [...value.days, day] : value.days.filter((d) => d !== day),
                  )
                }
              />
              {weekdays[day]}
            </label>
          ))}
        </fieldset>
        <div className="field">
          <label htmlFor={id + '-time'}>Time (optional)</label>
          <input
            id={id + '-time'}
            type="time"
            value={value.time ?? ''}
            onChange={(e) => set('time', e.target.value || undefined)}
            aria-describedby={id + '-time-note'}
          />
          <p id={id + '-time-note'} className="small muted">
            For the Today list only. Optional routines don’t send notifications.
          </p>
        </div>
        {!routine && (
          <div className="field">
            <label htmlFor={id + '-start'}>Start date</label>
            <input
              id={id + '-start'}
              type="date"
              required
              min={dateKey()}
              value={value.startDate}
              onChange={(e) => set('startDate', e.target.value)}
            />
          </div>
        )}
        <div className="field">
          <label htmlFor={id + '-activity'}>Blobby activity (optional)</label>
          <select
            id={id + '-activity'}
            value={value.activity ?? ''}
            onChange={(e) =>
              set(
                'activity',
                e.target.value ? (e.target.value as RoutineInput['activity']) : undefined,
              )
            }
          >
            <option value="">No activity</option>
            {Object.entries(ACTIVITY_NAMES).map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {routine && (
          <p className="small">
            Schedule changes start{' '}
            {schedule && schedule.from > addDays(dateKey(), 1) ? schedule.from : 'tomorrow'}. Use
            Today’s controls to change today.
          </p>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="routine-actions">
          <button className="button primary" type="submit">
            {routine ? 'Save changes' : 'Add routine'}
          </button>
          <button className="button secondary" type="button" onClick={close}>
            Cancel
          </button>
        </div>
      </form>
    </RoutineDialog>
  );
}
