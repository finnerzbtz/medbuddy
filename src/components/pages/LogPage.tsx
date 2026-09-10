import { RoutineCard } from '@/components/app/RoutinesToday';
import { routinesForDay } from '@/domain/routines';
import { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, CalendarDays } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import {
  addDays,
  checkInStreak,
  dateKey,
  dosesForDay,
  formatDay,
  parseDay,
} from '@/domain/schedule';
import { csvText, download } from '@/domain/exports';
import { useNow } from '@/components/app/AppRuntime';
import DoseCard from '@/components/app/DoseCard';
import './calm-pages.css';
export default function LogPage() {
  const data = useAppStore((s) => s.data),
    now = useNow(),
    today = dateKey(now);
  const [selected, setSelected] = useState(today),
    [month, setMonth] = useState(today.slice(0, 7)),
    [filter, setFilter] = useState(''),
    [focusedDay, setFocusedDay] = useState(today),
    [calendarOpen, setCalendarOpen] = useState(false);
  const dateButton = useRef<HTMLButtonElement>(null);
  const selectDay = (day: string, closeCalendar = false) => {
    setSelected(day);
    setFocusedDay(day);
    setMonth(day.slice(0, 7));
    if (closeCalendar) {
      setCalendarOpen(false);
      dateButton.current?.focus();
    }
  };
  const visibleDoses = (day: string) =>
    dosesForDay(data, day).filter((d) => !filter || d.medicationId === filter);
  const days = useMemo(() => {
    const first = parseDay(month + '-01'),
      offset = (first.getDay() + 6) % 7,
      start = addDays(dateKey(first), -offset);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [month]);
  const records = Object.values(data.records).filter((r) => !filter || r.medicationId === filter);
  const recent = records.filter((r) => r.date >= addDays(today, -6) && r.date <= today);
  const moveMonth = (amount: number) => {
    const value = parseDay(month + '-01');
    value.setMonth(value.getMonth() + amount);
    setMonth(dateKey(value).slice(0, 7));
    setFocusedDay(dateKey(value));
  };
  const daily = visibleDoses(selected);
  const selectedDate = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(selected.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' as const } : {}),
  }).format(parseDay(selected));
  const selectedDateLabel = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(
    parseDay(selected),
  );
  return (
    <div className="history-page calm-page">
      <div className="page-heading">
        <div>
          <h1>History</h1>
        </div>
        <button
          className="button secondary"
          onClick={() =>
            download(
              csvText(data),
              'reminduh-check-ins-' + today + '.csv',
              'text/csv;charset=utf-8',
            )
          }
        >
          <Download aria-hidden="true" focusable="false" size={17} /> Export CSV
        </button>
      </div>
      <div className="history-day-navigation" role="group" aria-label="History date">
        <button
          className="icon-button"
          aria-label="Previous day"
          disabled={selected <= '2000-01-01'}
          onClick={() => selectDay(addDays(selected, -1))}
        >
          <ChevronLeft aria-hidden="true" size={20} />
        </button>
        <button
          ref={dateButton}
          className="history-date-button"
          aria-label={'Choose date, ' + selectedDateLabel}
          aria-expanded={calendarOpen}
          aria-controls="history-calendar"
          onClick={() => {
            if (!calendarOpen) {
              setMonth(selected.slice(0, 7));
              setFocusedDay(selected);
            }
            setCalendarOpen(!calendarOpen);
          }}
        >
          <span aria-live="polite">{selected === today ? 'Today' : selectedDate}</span>
          <CalendarDays aria-hidden="true" size={17} />
        </button>
        <button
          className="icon-button"
          aria-label="Next day"
          disabled={selected >= today}
          onClick={() => selectDay(addDays(selected, 1))}
        >
          <ChevronRight aria-hidden="true" size={20} />
        </button>
      </div>
      <div className="history-content">
        <section className="panel calendar-panel" id="history-calendar" hidden={!calendarOpen}>
          <div className="calendar-heading">
            <h2 id="calendar-month" aria-live="polite">
              {new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(
                parseDay(month + '-01'),
              )}
            </h2>
            <div>
              <button
                className="icon-button"
                aria-label="Previous month"
                disabled={month <= '2000-01'}
                onClick={() => moveMonth(-1)}
              >
                <ChevronLeft aria-hidden="true" focusable="false" size={20} />
              </button>
              <button
                className="icon-button"
                aria-label="Next month"
                disabled={month >= today.slice(0, 7)}
                onClick={() => moveMonth(1)}
              >
                <ChevronRight aria-hidden="true" focusable="false" size={20} />
              </button>
            </div>
          </div>
          <div className="calendar-grid">
            <div className="calendar-weekdays">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>
            <p className="visually-hidden" id="calendar-keys">
              Arrow keys move between dates. Enter selects a date. Home and End move to the start
              and end of the week.
            </p>
            <div
              className="calendar-days"
              role="group"
              aria-labelledby="calendar-month"
              aria-describedby="calendar-keys"
            >
              {days.map((day) => {
                const doses = visibleDoses(day),
                  taken = doses.some((d) => d.record?.status === 'taken'),
                  skipped = doses.some((d) => d.record?.status === 'skipped'),
                  unrecorded = day < today && doses.some((d) => !d.record);
                return (
                  <button
                    key={day}
                    data-calendar-day={day}
                    tabIndex={day === focusedDay ? 0 : -1}
                    onFocus={() => setFocusedDay(day)}
                    onKeyDown={(event) => {
                      const weekday = (parseDay(day).getDay() + 6) % 7;
                      const step = (
                        {
                          ArrowLeft: -1,
                          ArrowRight: 1,
                          ArrowUp: -7,
                          ArrowDown: 7,
                          Home: -weekday,
                          End: 6 - weekday,
                        } as Record<string, number>
                      )[event.key];
                      if (step === undefined) return;
                      event.preventDefault();
                      const next = addDays(day, step);
                      if (next > today || next < '2000-01-01') return;
                      setFocusedDay(next);
                      setMonth(next.slice(0, 7));
                      requestAnimationFrame(() =>
                        document
                          .querySelector<HTMLButtonElement>(`[data-calendar-day="${next}"]`)
                          ?.focus(),
                      );
                    }}
                    className={
                      'calendar-day ' +
                      (day.slice(0, 7) !== month ? 'outside ' : '') +
                      (day === today ? 'today ' : '') +
                      (day === selected ? 'selected' : '')
                    }
                    disabled={day > today || day < '2000-01-01'}
                    aria-pressed={day === selected}
                    aria-label={
                      formatDay(day) +
                      ', ' +
                      doses.filter((d) => d.record).length +
                      ' of ' +
                      doses.length +
                      ' recorded. ' +
                      (taken ? 'Taken. ' : '') +
                      (skipped ? 'Skipped. ' : '') +
                      (unrecorded ? 'Not recorded. ' : '')
                    }
                    onClick={() => selectDay(day, true)}
                  >
                    <span>{parseDay(day).getDate()}</span>
                    <span className="calendar-dots">
                      {taken && <i className="taken-dot" />}
                      {skipped && <i className="skipped-dot" />}
                      {unrecorded && <i className="unrecorded-dot" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="calendar-legend">
            <span>
              <i className="taken-dot" /> Taken
            </span>
            <span>
              <i className="skipped-dot" /> Skipped
            </span>
            <span>
              <i className="unrecorded-dot" /> Not recorded
            </span>
          </div>
          <button className="text-link" onClick={() => selectDay(today, true)}>
            Back to today
          </button>
        </section>
        <section className="panel day-detail" aria-label="Medication history">
          <div className="section-heading">
            <h2>Medication</h2>
            <span className="count-badge">
              {daily.filter((d) => d.record).length}/{daily.length}
            </span>
          </div>
          <details className="history-filter-options">
            <summary>
              {filter
                ? (data.medications.find((m) => m.id === filter)?.name ?? 'Filtered medication')
                : 'All medications'}
            </summary>
            <label className="field history-filter">
              Filter medication
              <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="">All medications</option>
                {data.medications.map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.name}
                    {m.archived ? ' (archived)' : ''}
                  </option>
                ))}
              </select>
            </label>
          </details>
          {daily.length ? (
            <div className="dose-list">
              {daily.map((d) => (
                <div key={d.id}>
                  <DoseCard dose={d} />
                  {d.record?.note && <p className="history-note">{d.record.note}</p>}
                  {d.record && (
                    <p className="recorded-at">
                      Self-reported · recorded{' '}
                      {new Date(d.record.recordedAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state compact">
              <CalendarDays aria-hidden="true" focusable="false" size={28} strokeWidth={1.4} />
              <h3>A quiet day.</h3>
              <p>No scheduled doses or check-ins for this day.</p>
            </div>
          )}
        </section>
      </div>
      {routinesForDay(data, selected).length > 0 && (
        <section className="panel routines-today" aria-label="Optional routine history">
          <h2>Self-care</h2>
          {routinesForDay(data, selected).length ? (
            routinesForDay(data, selected).map((o) => (
              <RoutineCard key={o.id} occurrence={o} historical />
            ))
          ) : (
            <p>No optional routines on this day.</p>
          )}
        </section>
      )}
      <details className="panel history-summary">
        <summary>Last 7 days</summary>
        <div className="history-stats">
          <div>
            <span>Last 7 days</span>
            <strong>{recent.filter((r) => r.status === 'taken').length}</strong>
            <small>Doses recorded as taken</small>
          </div>
          <div>
            <span>Last 7 days</span>
            <strong>{recent.filter((r) => r.status === 'skipped').length}</strong>
            <small>Doses recorded as skipped</small>
          </div>
          {!data.preferences.hideRewards && (
            <div>
              <span>Showing up</span>
              <strong>
                {checkInStreak(data, today)}
                <em> days</em>
              </strong>
              <small>Current check-in streak</small>
            </div>
          )}
        </div>
      </details>
      <p className="page-footnote">
        “Not recorded” means there is no check-in; it does not assume you missed a dose. Select a
        dose to add a record or correct it.
      </p>
    </div>
  );
}
