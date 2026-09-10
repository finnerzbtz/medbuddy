import { parseData } from '@/domain/storage';
import type { AppData } from '@/types';

// OS notification permission, delivery receipts, snoozes and sound files belong to a device.
export function cloudPayload(data: AppData): AppData {
  return {
    ...parseData(data),
    reminders: {},
    preferences: { ...data.preferences, reminders: false },
    updatedAt: '2000-01-01T00:00:00.000Z',
  };
}
export function cloudFingerprint(data: AppData): string {
  const stable = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(stable)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([k, v]) => [k, stable(v)]),
          )
        : value;
  const payload = cloudPayload(data);
  payload.medications.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  payload.selfCare.routines.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return JSON.stringify(stable(payload));
}
export function applyCloudData(remote: AppData, local: AppData, sameAccount: boolean): AppData {
  const clean = parseData(remote);
  const medIds = new Set(clean.medications.map((m) => m.id));
  return {
    ...clean,
    preferences: { ...clean.preferences, reminders: sameAccount && local.preferences.reminders },
    reminders: sameAccount
      ? Object.fromEntries(
          Object.entries(local.reminders).filter(
            ([id]) => medIds.has(id.split('@')[0]) && !clean.records[id],
          ),
        )
      : {},
    updatedAt: new Date().toISOString(),
  };
}
