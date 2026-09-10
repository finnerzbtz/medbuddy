import { Check, ChevronRight, Clock3, Minus } from 'lucide-react';
import type { Dose } from '@/types';
import { dateKey, formatTime, scheduledAt } from '@/domain/schedule';
import { useAppStore } from '@/stores/appStore';
import { useCheckIn } from './CheckIn';
import { useNow } from './AppRuntime';
export default function DoseCard({ dose }: { dose: Dose }) {
  const now = useNow(),
    open = useCheckIn();
  const reminder = useAppStore((s) => s.data.reminders[dose.id]);
  const snoozed = reminder?.snoozedUntil && Date.parse(reminder.snoozedUntil) > now.getTime();
  const status = dose.record?.status;
  const pastDay = dose.date < dateKey(now);
  const due = scheduledAt(dose) <= now;
  const label =
    status === 'taken'
      ? 'Taken'
      : status === 'skipped'
        ? 'Skipped'
        : snoozed
          ? 'Snoozed until ' +
            new Date(reminder.snoozedUntil!).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
            })
          : pastDay
            ? 'Not recorded'
            : due
              ? 'Ready to check in'
              : 'Upcoming';
  return (
    <button
      className={'dose-card ' + (status ?? '')}
      onClick={() => open(dose.id)}
      aria-label={dose.name + ', ' + dose.dosage + ', ' + formatTime(dose.time) + ', ' + label}
    >
      <span className="dose-icon" style={{ '--med-color': dose.color } as React.CSSProperties}>
        {status === 'taken' ? (
          <Check aria-hidden="true" focusable="false" size={19} />
        ) : status === 'skipped' ? (
          <Minus aria-hidden="true" focusable="false" size={19} />
        ) : (
          <span className="pill-shape" />
        )}
      </span>
      <span className="dose-copy">
        <strong>{dose.name}</strong>
        <span>{dose.dosage}</span>
        <span className={'dose-status ' + (due && !status && !snoozed ? 'due' : '')}>
          {snoozed && <Clock3 aria-hidden="true" focusable="false" size={12} />}
          {label}
        </span>
      </span>
      <span className="dose-time">
        {formatTime(dose.time)}
        <ChevronRight aria-hidden="true" focusable="false" size={17} />
      </span>
    </button>
  );
}
