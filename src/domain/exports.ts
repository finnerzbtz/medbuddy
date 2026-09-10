import { isNative } from '@/native/platform';
import { shareExport } from '@/native/exports';
import type { AppData } from '../types/index';
import { addDays, dateKey, parseDay } from './schedule';

export function download(text: string, name: string, type: string): void {
  if (isNative) {
    void shareExport(text, name).catch(() =>
      window.dispatchEvent(new Event('native-export-error')),
    );
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function csvText(data: AppData): string {
  const cell = (value: string) =>
    '"' + (/^[\s]*[=+@-]/.test(value) ? "'" + value : value).replaceAll('"', '""') + '"';
  const rows = [
    [
      'Scheduled date',
      'Scheduled time',
      'Medication',
      'Dose',
      'Strength per tablet (mg)',
      'Tablets per dose',
      'Status',
      'Recorded at',
      'Note',
    ],
    ...Object.values(data.records)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .map((r) => [
        r.date,
        r.time,
        r.name,
        r.dosage,
        String(r.strengthMg ?? ''),
        String(r.tabletsPerDose ?? ''),
        r.status,
        r.recordedAt,
        r.note,
      ]),
  ];
  return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n');
}
function escapeICS(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('\r', '')
    .replaceAll('\n', '\\n')
    .replaceAll(',', '\\,')
    .replaceAll(';', '\\;');
}
function fold(line: string): string {
  const encoder = new TextEncoder();
  let segment = '',
    size = 0;
  const result: string[] = [];
  for (const char of line) {
    const length = encoder.encode(char).length;
    if (size + length > 73) {
      result.push(segment);
      segment = ' ';
      size = 1;
    }
    segment += char;
    size += length;
  }
  result.push(segment);
  return result.join('\r\n');
}
export function calendarText(data: AppData, today = dateKey()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Reminduh//One-device MVP//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Reminduh reminders',
  ];
  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  const clock =
    String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const days = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  for (const med of data.medications) {
    if (med.archived) continue;
    // Export the current period and future revisions without overlapping them.
    for (const [index, schedule] of med.schedules.entries()) {
      const following = med.schedules[index + 1];
      const end = following ? addDays(following.from, -1) : undefined;
      if (!schedule.active || (end && end < today)) continue;
      for (const time of schedule.times) {
        let first = schedule.from > today ? schedule.from : today;
        if (first === dateKey(now) && time <= clock) first = addDays(first, 1);
        for (let i = 0; i < 7 && !schedule.days.includes(parseDay(first).getDay()); i++)
          first = addDays(first, 1);
        if (end && first > end) continue;
        lines.push(
          'BEGIN:VEVENT',
          'UID:' + med.id + '-' + schedule.from + '-' + time.replace(':', '') + '@reminduh.local',
          'DTSTAMP:' + stamp,
          'DTSTART:' + first.replaceAll('-', '') + 'T' + time.replace(':', '') + '00',
          'DURATION:PT5M',
          'RRULE:FREQ=WEEKLY;BYDAY=' +
            schedule.days.map((d) => days[d]).join(',') +
            (end ? ';UNTIL=' + end.replaceAll('-', '') + 'T235959' : ''),
          'SUMMARY:' + escapeICS(med.name + ' · ' + med.dosage),
          'DESCRIPTION:' +
            escapeICS(
              'Check your Reminduh schedule. ' +
                med.instructions +
                '\nCalendar export is a snapshot. Replace it after schedule changes.',
            ),
          'BEGIN:VALARM',
          'TRIGGER:PT0S',
          'ACTION:DISPLAY',
          'DESCRIPTION:Time for a Reminduh check-in',
          'END:VALARM',
          'END:VEVENT',
        );
      }
    }
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
