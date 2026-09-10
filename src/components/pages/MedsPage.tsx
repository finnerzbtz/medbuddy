import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArrowRight, CalendarDays, Pencil, Pill, Play, Plus } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import {
  dateKey,
  DAYS,
  formatDay,
  formatTime,
  latestSchedule,
  remainingStock,
} from '@/domain/schedule';
export default function MedsPage() {
  const data = useAppStore((s) => s.data),
    [showArchived, setShowArchived] = useState(false);
  const meds = data.medications.filter((m) => m.archived === showArchived);
  const setStatus = (id: string, status: 'active' | 'paused' | 'archived') => {
    const result = useAppStore.getState().setMedicationStatus(id, status);
    useAppStore
      .getState()
      .showToast(
        result.ok
          ? status === 'active'
            ? 'Medication resumed from today.'
            : status === 'paused'
              ? 'Medication paused. Recorded history is kept.'
              : 'Medication archived. You can restore it anytime.'
          : result.error!,
      );
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Medications</h1>
        </div>
        <Link className="button primary" to="/meds/new">
          <Plus aria-hidden="true" focusable="false" size={18} /> Add medication
        </Link>
      </div>
      <div className="segmented-control">
        <button aria-pressed={!showArchived} onClick={() => setShowArchived(false)}>
          Your routine <span>{data.medications.filter((m) => !m.archived).length}</span>
        </button>
        <button aria-pressed={showArchived} onClick={() => setShowArchived(true)}>
          Archived <span>{data.medications.filter((m) => m.archived).length}</span>
        </button>
      </div>
      {!meds.length ? (
        <section className="panel empty-state">
          <span className="empty-icon">
            {showArchived ? (
              <Archive aria-hidden="true" focusable="false" size={30} />
            ) : (
              <Pill aria-hidden="true" focusable="false" size={30} />
            )}
          </span>
          <h2>{showArchived ? 'Nothing archived.' : 'A routine starts with one step.'}</h2>
          <p>
            {showArchived
              ? 'Archived medications keep their history and can be restored here.'
              : 'Add a medication to create your daily check-ins.'}
          </p>
          {!showArchived && (
            <Link className="button primary" to="/meds/new">
              Add your first medication{' '}
              <ArrowRight aria-hidden="true" focusable="false" size={17} />
            </Link>
          )}
        </section>
      ) : (
        <div className="medications-grid">
          {meds.map((med) => {
            const schedule = latestSchedule(med),
              stock = remainingStock(data, med),
              low = stock !== null && stock <= med.refillAt;
            return (
              <article
                className="panel medication-card"
                key={med.id}
                aria-labelledby={'med-title-' + med.id}
              >
                <div className="medication-heading">
                  <span
                    className="dose-icon"
                    style={{ '--med-color': med.color } as React.CSSProperties}
                  >
                    <span className="pill-shape" />
                  </span>
                  <div>
                    <h2 id={'med-title-' + med.id}>{med.name}</h2>
                    <p>{med.dosage}</p>
                  </div>
                  <span
                    className={'status-chip ' + (med.archived || !schedule.active ? 'neutral' : '')}
                  >
                    {med.archived ? 'Archived' : schedule.active ? 'Active' : 'Paused'}
                  </span>
                </div>
                <div className="med-schedule">
                  <CalendarDays aria-hidden="true" focusable="false" size={16} />
                  <span>
                    {schedule.days.length === 7
                      ? 'Every day'
                      : [1, 2, 3, 4, 5, 6, 0]
                          .filter((d) => schedule.days.includes(d))
                          .map((d) => DAYS[d])
                          .join(', ')}
                    <strong>{schedule.times.map(formatTime).join(' · ')}</strong>
                    {schedule.from > dateKey() && (
                      <small className="schedule-change">
                        {med.schedules.length > 1 ? 'New times from ' : 'Starts '}
                        {formatDay(schedule.from, true)}
                      </small>
                    )}
                  </span>
                </div>
                {med.instructions && <p className="med-instructions">{med.instructions}</p>}
                {stock !== null && (
                  <div className={'supply-note ' + (low ? 'low' : '')}>
                    <span>
                      {stock} scheduled {stock === 1 ? 'dose' : 'doses'} left
                    </span>
                    <span>{low ? 'Time to check your supply' : 'Supply tracked'}</span>
                  </div>
                )}
                <div className="med-actions">
                  <Link
                    className="button secondary"
                    aria-label={'Edit ' + med.name}
                    to={'/meds/' + med.id + '/edit'}
                  >
                    <Pencil aria-hidden="true" focusable="false" size={15} /> Edit
                  </Link>
                  <button
                    className="button ghost"
                    aria-label={
                      (schedule.active && !med.archived
                        ? 'Pause '
                        : med.archived
                          ? 'Restore '
                          : 'Resume ') + med.name
                    }
                    onClick={() =>
                      setStatus(med.id, schedule.active && !med.archived ? 'paused' : 'active')
                    }
                  >
                    {schedule.active && !med.archived ? (
                      'Pause'
                    ) : (
                      <>
                        <Play aria-hidden="true" focusable="false" size={14} />
                        {med.archived ? 'Restore' : 'Resume'}
                      </>
                    )}
                  </button>
                  {!med.archived && (
                    <button
                      className="icon-button archive-button"
                      aria-label={'Archive ' + med.name}
                      title="Archive medication; keep history"
                      onClick={() => {
                        setStatus(med.id, 'archived');
                        requestAnimationFrame(() =>
                          document
                            .querySelector<HTMLButtonElement>('.segmented-control button')
                            ?.focus(),
                        );
                      }}
                    >
                      <Archive aria-hidden="true" focusable="false" size={17} />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="page-footnote">
        Pausing or archiving removes unrecorded doses from today onward. Your earlier schedule and
        recorded check-ins are kept.
      </p>
    </>
  );
}
