import type { AppData, Dose, Medication, MedicationInput, Schedule } from '../types/index';

export const COLORS = ['#738962', '#c38b5f', '#9380a0', '#68959d', '#b7797a', '#909568'];
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
export { OUTFITS } from './catalog';
export const ROOM_ITEMS = [
  { id: 'Bonsai', name: 'Bonsai' },
  { id: 'Toy_ball', name: 'Toy ball' },
  { id: 'Books', name: 'Books' },
  { id: 'Lamp', name: 'Warm lamp' },
  { id: 'Bed', name: 'Blobby’s bed' },
  { id: 'Tea_table', name: 'Tea table' },
  { id: 'Garden', name: 'Window garden' },
  { id: 'Shelf', name: 'Shelf' },
] as const;

export function dateKey(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
export function addDays(day: string, amount: number): string {
  const value = parseDay(day);
  value.setDate(value.getDate() + amount);
  return dateKey(value);
}
export function isDate(day: unknown): day is string {
  return (
    typeof day === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(day) && dateKey(parseDay(day)) === day
  );
}
export function isTime(time: unknown): time is string {
  return typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}
export function doseId(id: string, day: string, time: string): string {
  return id + '@' + day + '@' + time;
}
export function scheduledAt(dose: Pick<Dose, 'date' | 'time'>): Date {
  const [y, m, d] = dose.date.split('-').map(Number),
    [h, minute] = dose.time.split(':').map(Number);
  return new Date(y, m - 1, d, h, minute);
}
export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(2026, 0, 1, h, m));
}
export function formatDay(day: string, short = false): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: short ? 'short' : 'long',
    month: 'short',
    day: 'numeric',
  }).format(parseDay(day));
}
export function scheduleAt(medication: Medication, day: string): Schedule | undefined {
  return [...medication.schedules].reverse().find((s) => s.from <= day);
}
export function latestSchedule(medication: Medication): Schedule {
  return medication.schedules[medication.schedules.length - 1];
}
export function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
export function formatDosage(strengthMg: number, tabletsPerDose: number): string {
  return `${tabletsPerDose} ${tabletsPerDose === 1 ? 'tablet' : 'tablets'} · ${strengthMg} mg per tablet`;
}
export function dosesForDay(data: AppData, day: string): Dose[] {
  const items = new Map<string, Dose>();
  for (const med of data.medications) {
    const schedule = scheduleAt(med, day);
    if (!schedule?.active || !schedule.days.includes(parseDay(day).getDay())) continue;
    for (const time of schedule.times) {
      const id = doseId(med.id, day, time);
      items.set(id, {
        id,
        medicationId: med.id,
        date: day,
        time,
        name: med.name,
        dosage: med.dosage,
        ...(med.strengthMg !== undefined && med.tabletsPerDose !== undefined
          ? { strengthMg: med.strengthMg, tabletsPerDose: med.tabletsPerDose }
          : {}),
        instructions: med.instructions,
        color: med.color,
      });
    }
  }
  // A recorded dose survives schedule edits, pauses and archive operations.
  for (const record of Object.values(data.records))
    if (record.date === day) {
      items.set(record.id, { ...record, record });
    }
  return [...items.values()].sort(
    (a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name),
  );
}
export function findDose(data: AppData, id: string): Dose | undefined {
  const day = id.split('@')[1];
  if (!isDate(day)) return;
  return dosesForDay(data, day).find((d) => d.id === id);
}
export function remainingStock(data: AppData, med: Medication): number | null {
  if (!med.stock) return null;
  const baseline = new Set(med.stock.baselineTakenIds);
  const used = Object.values(data.records).filter(
    (r) => r.medicationId === med.id && r.status === 'taken' && !baseline.has(r.id),
  ).length;
  return Math.max(0, med.stock.quantity - used);
}
export function checkInStreak(data: AppData, today = dateKey()): number {
  const days = new Set(
    Object.values(data.records)
      .filter((r) => r.date <= today)
      .map((r) => r.date),
  );
  let current = days.has(today) ? today : addDays(today, -1),
    streak = 0;
  while (days.has(current)) {
    streak++;
    current = addDays(current, -1);
  }
  return streak;
}
export function nextDose(data: AppData, now = new Date()): Dose | undefined {
  const today = dateKey(now);
  const candidates = new Set(Array.from({ length: 15 }, (_, offset) => addDays(today, offset)));
  for (const med of data.medications)
    for (const schedule of med.schedules)
      if (schedule.active && schedule.from > today) {
        for (let offset = 0; offset < 7; offset++) candidates.add(addDays(schedule.from, offset));
      }
  for (const day of [...candidates].sort()) {
    const dose = dosesForDay(data, day).find((d) => !d.record && scheduledAt(d) >= now);
    if (dose) return dose;
  }
}
export function relativeTime(dose: Dose, now: Date): string {
  const minutes = Math.ceil((scheduledAt(dose).getTime() - now.getTime()) / 60000);
  if (minutes <= 0) return 'Ready to check in';
  if (minutes < 60) return 'In ' + minutes + ' min';
  if (minutes < 1440)
    return (
      'In ' + Math.floor(minutes / 60) + 'h' + (minutes % 60 ? ' ' + (minutes % 60) + 'm' : '')
    );
  return formatDay(dose.date, true) + ' · ' + formatTime(dose.time);
}
export function validateMedication(input: MedicationInput, today = dateKey()): string | null {
  if (!input.name.trim() || input.name.trim().length > 80)
    return 'Enter a medication name of up to 80 characters.';
  if (!isPositiveNumber(input.strengthMg))
    return 'Enter the strength per tablet in mg as a number greater than zero.';
  if (!isPositiveNumber(input.tabletsPerDose))
    return 'Enter the number of tablets per dose as a number greater than zero.';
  if (input.instructions.length > 500) return 'Keep instructions under 500 characters.';
  if (!/^#[0-9a-f]{6}$/i.test(input.color)) return 'Choose a valid colour.';
  if (!input.times.length || input.times.length > 8 || !input.times.every(isTime))
    return 'Add between 1 and 8 valid reminder times.';
  if (new Set(input.times).size !== input.times.length)
    return 'Each reminder time must be different.';
  if (
    !input.days.length ||
    !input.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) ||
    new Set(input.days).size !== input.days.length
  )
    return 'Choose at least one day of the week.';
  if (!isDate(input.startDate) || input.startDate < today || input.startDate > addDays(today, 366))
    return 'Choose a start date between today and one year from today.';
  if (
    input.supply !== null &&
    (!Number.isInteger(input.supply) || input.supply < 0 || input.supply > 100000)
  )
    return 'Supply must be a whole number between 0 and 100,000.';
  if (!Number.isInteger(input.refillAt) || input.refillAt < 0 || input.refillAt > 100000)
    return 'The refill threshold must be a whole number between 0 and 100,000.';
  return null;
}
