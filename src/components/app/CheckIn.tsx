import { isNative } from '@/native/platform';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, Clock3, SkipForward, X, Undo2 } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { dateKey, findDose, formatDay, formatTime, scheduledAt } from '@/domain/schedule';
import { useNow, useReminderStatus } from './AppRuntime';

const CheckInContext = createContext<(id: string) => void>(() => {});
export const useCheckIn = () => useContext(CheckInContext);
export function CheckInProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const open = (id: string) => {
    trigger.current = document.activeElement as HTMLElement;
    setSelected(id);
  };
  const close = () => {
    setSelected(null);
    requestAnimationFrame(() => {
      if (trigger.current?.isConnected) trigger.current.focus();
      else document.getElementById('check-ins')?.focus({ preventScroll: true });
    });
  };
  return (
    <CheckInContext.Provider value={open}>
      {children}
      {selected && <CheckInDialog id={selected} close={close} />}
    </CheckInContext.Provider>
  );
}
function CheckInDialog({ id, close }: { id: string; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const data = useAppStore((s) => s.data);
  const dose = findDose(data, id);
  const now = useNow();
  const { permission } = useReminderStatus();
  const alertsOn = data.preferences.reminders && permission === 'granted';
  const [note, setNote] = useState(dose?.record?.note ?? '');
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  const record = (status: 'taken' | 'skipped') => {
    const result = useAppStore.getState().recordDose(id, status, note);
    if (result.ok) close();
    else setError(result.error!);
  };
  return (
    <dialog
      className="app-dialog checkin-dialog"
      ref={ref}
      onCancel={close}
      aria-labelledby="checkin-title"
    >
      <div className="dialog-heading">
        <span className="eyebrow">Check-in</span>
        <button className="icon-button" aria-label="Close check-in" onClick={close}>
          <X aria-hidden="true" focusable="false" size={21} />
        </button>
      </div>
      <h2 id="checkin-title">{dose?.record ? 'Update this check-in' : 'Record your dose'}</h2>
      {dose ? (
        <>
          <div className="checkin-med">
            <span className="med-marker" style={{ background: dose.color }} />
            <div>
              <h3>{dose.name}</h3>
              <p>{dose.dosage}</p>
            </div>
          </div>
          <div className="subtle-row">
            <Clock3 aria-hidden="true" focusable="false" size={16} /> {formatDay(dose.date)} ·{' '}
            {formatTime(dose.time)}
          </div>
          {dose.instructions && <p className="instruction-note">{dose.instructions}</p>}
          <p className="muted small">
            This is your own record. Confirm only what you have already done.
          </p>
          {dose.date > dateKey(now) ? (
            <p className="notice">
              This dose is scheduled for a future day. You can record it on that day.
            </p>
          ) : (
            <>
              {!dose.record && scheduledAt(dose) > now && (
                <p className="notice">
                  This dose is scheduled for later today. Only log it now if you have already taken
                  it.
                </p>
              )}
              <label className="field">
                Note <span className="optional">(optional)</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder="Anything you’d like to remember"
                />
              </label>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              {skipping ? (
                <div className="stack">
                  <p className="muted">
                    You can record a skip without giving a reason. For advice about a missed dose,
                    follow your medication instructions or ask a pharmacist.
                  </p>
                  <button
                    id="confirm-skip"
                    className="button primary full"
                    onClick={() => record('skipped')}
                  >
                    <SkipForward aria-hidden="true" focusable="false" size={18} /> Record as skipped
                  </button>
                  <button
                    className="button ghost full"
                    onClick={() => {
                      setSkipping(false);
                      requestAnimationFrame(() => document.getElementById('record-skip')?.focus());
                    }}
                  >
                    Back
                  </button>
                </div>
              ) : (
                <div className="stack">
                  <button className="button primary full" onClick={() => record('taken')}>
                    <Check aria-hidden="true" focusable="false" size={19} />{' '}
                    {dose.record?.status === 'taken' ? 'Save as taken' : 'I’ve taken this dose'}
                  </button>
                  <button
                    className="button secondary full"
                    id="record-skip"
                    onClick={() => {
                      setSkipping(true);
                      requestAnimationFrame(() => document.getElementById('confirm-skip')?.focus());
                    }}
                  >
                    <SkipForward aria-hidden="true" focusable="false" size={17} />{' '}
                    {dose.record?.status === 'skipped' ? 'Update skipped dose' : 'Record a skip'}
                  </button>
                </div>
              )}
              {dose.record && (
                <button
                  className="button ghost full"
                  onClick={() => {
                    const result = useAppStore.getState().undoDose(id);
                    if (result.ok) close();
                    else setError(result.error!);
                  }}
                >
                  <Undo2 aria-hidden="true" focusable="false" size={16} /> Remove this check-in
                </button>
              )}
              {!dose.record && dose.date === dateKey(now) && (
                <>
                  <button
                    className="button ghost full"
                    onClick={() => {
                      const result = useAppStore.getState().snoozeDose(id, 10);
                      if (result.ok) {
                        useAppStore
                          .getState()
                          .showToast(
                            alertsOn
                              ? isNative
                                ? 'Snoozed for 10 minutes.'
                                : 'Snoozed for 10 minutes. Keep Reminduh open for the alert.'
                              : 'Snoozed for 10 minutes. ' +
                                  (isNative ? 'Device' : 'Browser') +
                                  ' alerts are off; the time will update in Today.',
                          );
                        close();
                      } else setError(result.error!);
                    }}
                  >
                    <Clock3 aria-hidden="true" focusable="false" size={16} /> Remind me in 10
                    minutes
                  </button>
                  {!alertsOn && (
                    <p className="snooze-help">
                      {isNative ? 'Device alerts are off. ' : 'Browser alerts are off. '}
                      <Link to="/profile#reminders" onClick={close}>
                        Set up reminders
                      </Link>
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </>
      ) : (
        <p className="notice">
          This dose has changed or is no longer scheduled. Close this window to see the latest
          schedule.
        </p>
      )}
    </dialog>
  );
}
