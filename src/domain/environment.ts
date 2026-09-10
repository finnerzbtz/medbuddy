/** Local device time: no location access or network dependency. */
export interface RoomEnvironmentState {
  phase: 'night' | 'dawn' | 'day' | 'dusk';
  daylight: number;
  sky: string;
  light: string;
  backdrop: string;
}
const stops = [
  {
    hour: 0,
    daylight: 0,
    sky: '#17294b',
    light: '#a7b9ed',
    backdrop: '#a9b7cb',
  },
  {
    hour: 5.5,
    daylight: 0,
    sky: '#17294b',
    light: '#a7b9ed',
    backdrop: '#a9b7cb',
  },
  {
    hour: 7,
    daylight: 0.5,
    sky: '#d8a998',
    light: '#ffe0c1',
    backdrop: '#dfcec4',
  },
  {
    hour: 9,
    daylight: 1,
    sky: '#86bbca',
    light: '#fff0d8',
    backdrop: '#d6e2d8',
  },
  {
    hour: 17,
    daylight: 1,
    sky: '#86bbca',
    light: '#fff0d8',
    backdrop: '#d6e2d8',
  },
  {
    hour: 19,
    daylight: 0.45,
    sky: '#b18dba',
    light: '#ffd0b1',
    backdrop: '#cdc0d0',
  },
  {
    hour: 21,
    daylight: 0,
    sky: '#17294b',
    light: '#a7b9ed',
    backdrop: '#a9b7cb',
  },
  {
    hour: 24,
    daylight: 0,
    sky: '#17294b',
    light: '#a7b9ed',
    backdrop: '#a9b7cb',
  },
];
function blend(a: string, b: string, t: number) {
  return (
    '#' +
    [1, 3, 5]
      .map((i) =>
        Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
export function roomEnvironment(date = new Date()): RoomEnvironmentState {
  const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const next = stops.findIndex((s) => s.hour > hour);
  const a = stops[Math.max(0, next - 1)],
    b = stops[next < 0 ? stops.length - 1 : next];
  const fraction = Math.max(0, Math.min(1, (hour - a.hour) / (b.hour - a.hour || 1)));
  const t = fraction * fraction * (3 - 2 * fraction);
  return {
    phase: hour < 5.5 || hour >= 21 ? 'night' : hour < 9 ? 'dawn' : hour < 17 ? 'day' : 'dusk',
    daylight: a.daylight + (b.daylight - a.daylight) * t,
    sky: blend(a.sky, b.sky, t),
    light: blend(a.light, b.light, t),
    backdrop: blend(a.backdrop, b.backdrop, t),
  };
}
export const DAYLIGHT = roomEnvironment(new Date(2026, 0, 1, 12));
