import type { AppData } from '../types';
import { addDays, dateKey, dosesForDay, scheduleAt } from './schedule';
import { reminderTime } from './reminders';

export const NATIVE_REMINDER_LIMIT = 60;
export const NATIVE_REMINDER_DAYS = 30;
export interface PlannedReminder {
  id: number;
  at: Date;
  doseIds: string[];
  token: string;
}
export function notificationId(token: string): number {
  // Stable positive signed-32-bit identifiers; the planner resolves any collisions.
  let hash = 2166136261;
  for (const char of token) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return ((hash >>> 0) % 2000000000) + 1;
}
export function planNativeReminders(data: AppData, now = new Date()): PlannedReminder[] {
  if (!data.preferences.reminders) return [];
  const today = dateKey(now);
  const available = { ...data, medications: data.medications.filter((med) => !med.archived) };
  const groups = new Map<number, string[]>();
  for (let day = -1; day < NATIVE_REMINDER_DAYS; day++) {
    for (const dose of dosesForDay(available, addDays(today, day))) {
      if (dose.record || data.reminders[dose.id]?.notifiedAt) continue;
      if (
        day === -1 &&
        !available.medications.some(
          (med) => med.id === dose.medicationId && scheduleAt(med, today)?.active,
        )
      )
        continue;
      const at = reminderTime(data, dose);
      // Never issue a new take-dose alert for a past time. The Today CTA handles catch-up.
      if (at <= +now || (day === -1 && !data.reminders[dose.id]?.snoozedUntil)) continue;
      const ids = groups.get(at) ?? [];
      ids.push(dose.id);
      groups.set(at, ids);
    }
  }
  const used = new Set<number>();
  return [...groups]
    .sort(([a], [b]) => a - b)
    .slice(0, NATIVE_REMINDER_LIMIT)
    .map(([at, doseIds]) => {
      const token = String(at) + ':' + doseIds.sort().join('|');
      let id = notificationId(token);
      while (used.has(id)) id = (id % 2000000000) + 1;
      used.add(id);
      return { id, at: new Date(at), doseIds, token };
    });
}
