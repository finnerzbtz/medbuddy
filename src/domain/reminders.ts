import type { AppData, Dose } from '../types';
import { addDays, dateKey, dosesForDay, nextDose, scheduledAt, scheduleAt } from './schedule';

export type ReminderDelivery = { id: string; snoozedUntil?: string };

export function reminderTime(data: AppData, dose: Dose): number {
  const snooze = data.reminders[dose.id]?.snoozedUntil;
  return Math.max(scheduledAt(dose).getTime(), snooze ? Date.parse(snooze) : 0);
}

// Only catch up today's doses. An explicit snooze can carry a dose across midnight.
export function reminderCandidates(data: AppData, now = new Date()): Dose[] {
  const today = dateKey(now);
  const active = new Set(
    data.medications
      .filter((med) => !med.archived && scheduleAt(med, today)?.active)
      .map((med) => med.id),
  );
  return [
    ...dosesForDay(data, addDays(today, -1)).filter((dose) => {
      const snooze = data.reminders[dose.id]?.snoozedUntil;
      return snooze && dateKey(new Date(snooze)) === today;
    }),
    ...dosesForDay(data, today),
  ].filter((dose) => !dose.record && active.has(dose.medicationId));
}

export function dueReminders(data: AppData, now = new Date()): ReminderDelivery[] {
  return reminderCandidates(data, now)
    .filter((dose) => !data.reminders[dose.id]?.notifiedAt && reminderTime(data, dose) <= +now)
    .map((dose) => ({ id: dose.id, snoozedUntil: data.reminders[dose.id]?.snoozedUntil }));
}

export function nextReminderTime(data: AppData, now = new Date()): Date | undefined {
  const available = { ...data, medications: data.medications.filter((med) => !med.archived) };
  const next = nextDose(available, now);
  const candidates = reminderCandidates(data, now);
  if (next && !candidates.some((dose) => dose.id === next.id)) candidates.push(next);
  const times = candidates
    .filter((dose) => !data.reminders[dose.id]?.notifiedAt)
    .map((dose) => reminderTime(data, dose));
  return times.length ? new Date(Math.max(+now, Math.min(...times))) : undefined;
}
