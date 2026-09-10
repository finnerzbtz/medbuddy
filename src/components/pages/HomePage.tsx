import RoutinesToday from '@/components/app/RoutinesToday';
import { useCheckIn } from '@/components/app/CheckIn';
import { scheduledAt } from '@/domain/schedule';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Clock3, Plus } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { dateKey, dosesForDay, nextDose, relativeTime } from '@/domain/schedule';
import CompanionPanel, { CompanionGoals } from '@/components/app/CompanionPanel';
import { ReminderSummary } from '@/components/app/ReminderSettings';
import DoseCard from '@/components/app/DoseCard';
import { useNow } from '@/components/app/AppRuntime';
export default function HomePage() {
  const data = useAppStore((s) => s.data),
    now = useNow();
  const today = dateKey(now),
    doses = dosesForDay(data, today),
    checked = doses.filter((d) => d.record).length;
  const pending = doses.filter((d) => !d.record),
    upcoming = nextDose(data, now);
  const openCheckIn = useCheckIn();
  const due = pending.find((d) => +scheduledAt(d) <= +now);
  const previousRecord = Object.values(data.records).sort((a, b) =>
    b.recordedAt.localeCompare(a.recordedAt),
  )[0];
  const returning = previousRecord && previousRecord.date < today;
  const active = data.medications.filter((m) => !m.archived);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {new Intl.DateTimeFormat(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            }).format(now)}
          </span>
          <h1>{data.profile.name ? 'Hi, ' + data.profile.name + '.' : 'Today'}</h1>
        </div>
        <Link to="/meds/new" className="button secondary desktop-add">
          <Plus aria-hidden="true" focusable="false" size={17} /> Add medication
        </Link>
      </div>
      {returning && (
        <p className="return-welcome">Welcome back. We can take today one thing at a time.</p>
      )}
      {due && (
        <div className="medication-shortcut">
          <span>
            <strong>{due.name}</strong> · Medication check-in
          </span>
          <button className="button primary" onClick={() => openCheckIn(due.id)}>
            Review dose
          </button>
        </div>
      )}
      <div className="home-grid">
        <CompanionPanel />
        <div className="home-sidebar">
          <section className="today-panel" id="check-ins" tabIndex={-1}>
            <div className="section-heading">
              <div>
                <h2>Today’s check-ins</h2>
              </div>
              <span className="count-badge">
                {checked}/{doses.length}
              </span>
            </div>
            {doses.length > 0 ? (
              <>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label="Today's recorded doses"
                  aria-valuemin={0}
                  aria-valuemax={doses.length}
                  aria-valuenow={checked}
                >
                  <span style={{ width: (checked / doses.length) * 100 + '%' }} />
                </div>

                <div className="dose-list">
                  {doses.map((d) => (
                    <DoseCard key={d.id} dose={d} />
                  ))}
                </div>
                {!pending.length && (
                  <div className="done-note">
                    <Check aria-hidden="true" focusable="false" size={19} /> All checked in for
                    today.
                  </div>
                )}
              </>
            ) : (
              <div className="empty-state compact">
                <span className="empty-icon">
                  <Clock3 aria-hidden="true" focusable="false" size={26} strokeWidth={1.5} />
                </span>
                <h3>{active.length ? 'Nothing scheduled today' : 'Add your first medication'}</h3>
                <p>
                  {active.length
                    ? 'Nothing is scheduled for today. Your next check-in will appear here.'
                    : 'Add your first medication and choose the times that match your instructions.'}
                </p>
                <Link to={active.length ? '/meds' : '/meds/new'} className="button primary">
                  {active.length ? 'View medications' : 'Add a medication'}
                  <ArrowRight aria-hidden="true" focusable="false" size={17} />
                </Link>
              </div>
            )}
            {upcoming && (
              <div className="next-dose">
                <Clock3 aria-hidden="true" focusable="false" size={16} />
                <span>
                  Next: <strong>{upcoming.name}</strong>
                  <small>{relativeTime(upcoming, now)}</small>
                </span>
              </div>
            )}
            <ReminderSummary />
          </section>
          <RoutinesToday />
          <CompanionGoals />
        </div>
      </div>
    </>
  );
}
