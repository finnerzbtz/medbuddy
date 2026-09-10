import { useMemo, useRef, useState } from 'react';
import MedicationNameInput from './MedicationNameInput';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Plus, Trash2 } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import {
  COLORS,
  dateKey,
  DAY_ORDER,
  DAYS,
  latestSchedule,
  remainingStock,
} from '@/domain/schedule';
import type { MedicationInput } from '@/types';
export default function MedicationForm() {
  const { id } = useParams(),
    navigate = useNavigate(),
    [params] = useSearchParams();
  const data = useAppStore((s) => s.data),
    medication = data.medications.find((m) => m.id === id);
  const previousNames = useMemo(
    () => data.medications.map((item) => item.name),
    [data.medications],
  );
  const schedule = medication && latestSchedule(medication);
  const [form, setForm] = useState<MedicationInput>(() => ({
    name: medication?.name ?? '',
    strengthMg: medication?.strengthMg ?? null,
    tabletsPerDose: medication?.tabletsPerDose ?? null,
    instructions: medication?.instructions ?? '',
    color: medication?.color ?? COLORS[0],
    times: schedule ? [...schedule.times] : ['08:00'],
    days: schedule ? [...schedule.days] : [0, 1, 2, 3, 4, 5, 6],
    startDate: dateKey(),
    supply: medication ? remainingStock(data, medication) : null,
    refillAt: medication?.refillAt ?? 5,
  }));
  const errorSummary = useRef<HTMLDivElement>(null);
  const [errorField, setErrorField] = useState('');
  const [error, setError] = useState(''),
    [supplyChanged, setSupplyChanged] = useState(false);
  const update = <K extends keyof MedicationInput>(key: K, value: MedicationInput[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setError('');
    setErrorField('');
  };
  if (id && !medication)
    return (
      <div className="empty-state">
        <h1>Medication not found</h1>
        <Link className="button primary" to="/meds">
          Back to medications
        </Link>
      </div>
    );
  return (
    <div className="form-page">
      <Link to="/meds" className="back-link">
        <ArrowLeft aria-hidden="true" focusable="false" size={17} /> Medications
      </Link>
      <div className="page-heading">
        <div>
          <h1>{medication ? 'Edit medication' : 'Add a medication'}</h1>
          <p>Use the name, dose and schedule from your medication instructions.</p>
        </div>
      </div>
      <form
        className="medication-form"
        onSubmit={(e) => {
          e.preventDefault();
          const result = useAppStore
            .getState()
            .saveMedication({ ...form, updateSupply: supplyChanged }, id);
          if (result.ok) {
            useAppStore
              .getState()
              .showToast(
                medication
                  ? 'Medication updated. Schedule changes start tomorrow.'
                  : 'Medication added to your routine.',
              );
            navigate(params.has('welcome') ? '/welcome/reminders' : '/meds');
          } else {
            const message = result.error!;
            setError(message);
            setErrorField(
              /strength/i.test(message)
                ? 'strengthMg'
                : /tablet/i.test(message)
                  ? 'tabletsPerDose'
                  : /time/i.test(message)
                    ? 'times'
                    : /date/i.test(message)
                      ? 'startDate'
                      : /day/i.test(message)
                        ? 'days'
                        : /name/i.test(message)
                          ? 'name'
                          : '',
            );
            requestAnimationFrame(() => errorSummary.current?.focus());
          }
        }}
      >
        {error && (
          <div className="form-error" ref={errorSummary} tabIndex={-1} role="alert">
            <h2>Check this before saving</h2>
            {errorField ? (
              <a
                href={'#med-' + errorField}
                onClick={(event) => {
                  event.preventDefault();
                  const element = document.getElementById('med-' + errorField);
                  (element?.matches('input')
                    ? element
                    : element?.querySelector<HTMLElement>('input, button')
                  )?.focus();
                }}
              >
                {error}
              </a>
            ) : (
              <p>{error}</p>
            )}
          </div>
        )}
        <section className="panel">
          <h2 className="eyebrow">The essentials</h2>
          <MedicationNameInput
            value={form.name}
            onChange={(name) => update('name', name)}
            previousNames={previousNames}
            invalid={errorField === 'name'}
          />
          {medication && medication.strengthMg === undefined && (
            <p className="small muted">
              Previous dose: {medication.dosage}. Enter its strength and tablet count below. Your
              previous check-ins will keep their original dose details.
            </p>
          )}
          <div className="form-grid dose-fields">
            <label className="field">
              Strength per tablet (mg)
              <input
                required
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                id="med-strengthMg"
                aria-invalid={errorField === 'strengthMg' || undefined}
                value={form.strengthMg ?? ''}
                placeholder="e.g. 10"
                onChange={(e) =>
                  update(
                    'strengthMg',
                    Number.isNaN(e.target.valueAsNumber) ? null : e.target.valueAsNumber,
                  )
                }
              />
            </label>
            <label className="field">
              Number of tablets per dose
              <input
                required
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                id="med-tabletsPerDose"
                aria-invalid={errorField === 'tabletsPerDose' || undefined}
                value={form.tabletsPerDose ?? ''}
                placeholder="e.g. 1"
                onChange={(e) =>
                  update(
                    'tabletsPerDose',
                    Number.isNaN(e.target.valueAsNumber) ? null : e.target.valueAsNumber,
                  )
                }
              />
            </label>
          </div>
          <label className="field">
            Instructions <span className="optional">(optional)</span>
            <textarea
              value={form.instructions}
              maxLength={500}
              rows={2}
              placeholder="Any instructions you want to keep handy"
              onChange={(e) => update('instructions', e.target.value)}
            />
          </label>
          <fieldset className="color-field">
            <legend>Label colour</legend>
            <div className="color-picker">
              {COLORS.map((color, i) => (
                <button
                  key={color}
                  type="button"
                  style={{ background: color }}
                  aria-label={['Sage green', 'Terracotta', 'Lavender', 'Teal', 'Rose', 'Olive'][i]}
                  aria-pressed={color === form.color}
                  onClick={() => update('color', color)}
                >
                  {color === form.color && <Check aria-hidden="true" focusable="false" size={16} />}
                </button>
              ))}
            </div>
          </fieldset>
        </section>
        <section className="panel">
          <span className="eyebrow">02 / Your schedule</span>
          <div className="section-heading">
            <h2>Which days?</h2>
            <button
              className="text-link"
              type="button"
              onClick={() => update('days', [0, 1, 2, 3, 4, 5, 6])}
            >
              Every day
            </button>
          </div>
          <div
            id="med-days"
            className="day-picker"
            role="group"
            aria-invalid={errorField === 'days' || undefined}
            aria-label="Scheduled days"
          >
            {DAY_ORDER.map((day) => (
              <button
                type="button"
                key={day}
                aria-pressed={form.days.includes(day)}
                onClick={() =>
                  update(
                    'days',
                    form.days.includes(day)
                      ? form.days.filter((d) => d !== day)
                      : [...form.days, day],
                  )
                }
              >
                {DAYS[day]}
              </button>
            ))}
          </div>
          <div className="section-heading">
            <h2>At what time?</h2>
            <span className="small muted">Your device’s local time</span>
          </div>
          <div className="times-list" id="med-times">
            {form.times.map((time, i) => (
              <div className="time-row" key={i}>
                <label className="field">
                  Time {i + 1}
                  <input
                    type="time"
                    id={'med-time-' + i}
                    aria-invalid={errorField === 'times' || undefined}
                    required
                    value={time}
                    onChange={(e) =>
                      update(
                        'times',
                        form.times.map((v, index) => (i === index ? e.target.value : v)),
                      )
                    }
                  />
                </label>
                {form.times.length > 1 && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={'Remove time ' + (i + 1)}
                    onClick={() => {
                      update(
                        'times',
                        form.times.filter((_, index) => index !== i),
                      );
                      requestAnimationFrame(() =>
                        document.getElementById('med-time-' + Math.max(0, i - 1))?.focus(),
                      );
                    }}
                  >
                    <Trash2 aria-hidden="true" focusable="false" size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {form.times.length < 8 && (
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                const index = form.times.length;
                update('times', [...form.times, '18:00']);
                requestAnimationFrame(() => document.getElementById('med-time-' + index)?.focus());
              }}
            >
              <Plus aria-hidden="true" focusable="false" size={16} /> Add another time
            </button>
          )}
          {!medication && (
            <label className="field start-date">
              Start date
              <input
                type="date"
                required
                min={dateKey()}
                id="med-startDate"
                value={form.startDate}
                onChange={(e) => update('startDate', e.target.value)}
              />
            </label>
          )}
          {medication && (
            <p className="notice">
              Schedule changes start tomorrow, or on the existing start date if that is later.
              Today’s schedule and recorded doses stay unchanged.
              {!schedule?.active ? ' This medication will stay paused until you resume it.' : ''}
            </p>
          )}
        </section>
        <section className="panel">
          <span className="eyebrow">03 / Keeping stocked up</span>
          <label className="toggle-row">
            <span>
              <strong>Track remaining supply</strong>
              <small>Count complete scheduled doses, not individual tablets.</small>
            </span>
            <input
              type="checkbox"
              checked={form.supply !== null}
              onChange={(e) => {
                update('supply', e.target.checked ? 30 : null);
                setSupplyChanged(true);
              }}
            />
          </label>
          {form.supply !== null && (
            <div className="form-grid">
              <label className="field">
                Scheduled doses remaining
                <input
                  type="number"
                  min={0}
                  max={100000}
                  step={1}
                  required
                  value={Number.isNaN(form.supply) ? '' : form.supply}
                  onChange={(e) => {
                    update('supply', e.target.value === '' ? NaN : Number(e.target.value));
                    setSupplyChanged(true);
                  }}
                />
              </label>
              <label className="field">
                Refill reminder at
                <input
                  type="number"
                  min={0}
                  max={100000}
                  step={1}
                  required
                  value={Number.isNaN(form.refillAt) ? '' : form.refillAt}
                  onChange={(e) =>
                    update('refillAt', e.target.value === '' ? NaN : Number(e.target.value))
                  }
                />
              </label>
            </div>
          )}
        </section>

        <div className="form-actions">
          <Link
            to={params.has('welcome') ? '/welcome/reminders' : '/meds'}
            className="button ghost"
          >
            {params.has('welcome') ? 'I’ll add this later' : 'Cancel'}
          </Link>
          <button className="button primary" type="submit">
            <Check aria-hidden="true" focusable="false" size={18} />{' '}
            {medication ? 'Save changes' : 'Add medication'}
          </button>
        </div>
      </form>
    </div>
  );
}
