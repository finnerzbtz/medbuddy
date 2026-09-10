import type {
  AppData,
  Routine,
  RoutineInput,
  RoutineRecord,
  RoutineStatus,
  SelfCare,
} from '../types';
import { addDays, dateKey, isDate, isTime } from './schedule';

export const ROUTINE_CATEGORIES = [
  'rest',
  'everyday-care',
  'enjoyment',
  'connection',
  'preparation',
] as const;
export const ROUTINE_ACTIVITIES = ['tea', 'sand', 'garden', 'bed', 'music'] as const;
export const emptySelfCare = (): SelfCare => ({
  routines: [],
  records: {},
  overrides: {},
  rewards: {},
  introductionDismissed: false,
});
export const routineId = (id: string, day: string) => `${id}@${day}`;
const validId = (id: unknown): id is string =>
  typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
const obj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const stamp = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^\d{4}-\d\d-\d\dT/.test(v) &&
  v.length <= 40 &&
  Number.isFinite(Date.parse(v));
function check(
  value: unknown,
  message = 'The optional routine data could not be read. Your saved copy has been kept.',
): asserts value {
  if (!value) throw new Error(message);
}
const title = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= 80;
const category = (v: unknown) => ROUTINE_CATEGORIES.includes(v as Routine['category']);
const daysValid = (v: unknown): v is number[] =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.length <= 7 &&
  v.every((x) => Number.isInteger(x) && x >= 0 && x <= 6) &&
  new Set(v).size === v.length;
const occurrenceKey = (key: string, ids: Set<string>) => {
  const [id, day, ...extra] = key.split('@');
  return ids.has(id) && isDate(day) && !extra.length;
};

export function parseSelfCare(value: unknown): SelfCare {
  check(
    obj(value) &&
      Array.isArray(value.routines) &&
      value.routines.length <= 100 &&
      typeof value.introductionDismissed === 'boolean',
  );
  const routines: Routine[] = value.routines.map((v) => {
    check(
      obj(v) &&
        validId(v.id) &&
        title(v.title) &&
        category(v.category) &&
        stamp(v.createdAt) &&
        typeof v.archived === 'boolean',
    );
    check(
      v.activity === undefined ||
        ROUTINE_ACTIVITIES.includes(v.activity as Routine['activity'] & string),
    );
    check(Array.isArray(v.schedules) && v.schedules.length > 0 && v.schedules.length <= 2000);
    const schedules = v.schedules.map((s) => {
      check(
        obj(s) &&
          isDate(s.from) &&
          daysValid(s.days) &&
          typeof s.active === 'boolean' &&
          (s.time === undefined || isTime(s.time)),
      );
      return {
        from: s.from,
        days: [...s.days],
        active: s.active,
        ...(s.time === undefined ? {} : { time: s.time as string }),
      };
    });
    check(schedules.every((s, i) => !i || s.from > schedules[i - 1].from));
    return {
      id: v.id,
      title: v.title,
      category: v.category as Routine['category'],
      createdAt: v.createdAt,
      archived: v.archived,
      schedules,
      ...(v.activity ? { activity: v.activity as Routine['activity'] } : {}),
    };
  });
  const ids = new Set(routines.map((r) => r.id));
  check(ids.size === routines.length);
  for (const key of ['records', 'overrides', 'rewards'])
    check(obj(value[key]) && Object.keys(value[key]).length <= 50000);
  const records: SelfCare['records'] = {},
    overrides: SelfCare['overrides'] = {},
    rewards: SelfCare['rewards'] = {};
  for (const [key, v] of Object.entries(value.rewards as Record<string, unknown>)) {
    check(
      occurrenceKey(key, ids) &&
        obj(v) &&
        Number.isInteger(v.amount) &&
        Number(v.amount) >= 0 &&
        Number(v.amount) <= 5 &&
        isDate(v.rewardDay),
    );
    rewards[key] = { amount: v.amount as number, rewardDay: v.rewardDay };
  }
  const daily: Record<string, number> = {};
  for (const marker of Object.values(rewards)) {
    daily[marker.rewardDay] = (daily[marker.rewardDay] ?? 0) + marker.amount;
    check(daily[marker.rewardDay] <= 15);
  }
  for (const [key, v] of Object.entries(value.records as Record<string, unknown>)) {
    check(
      occurrenceKey(key, ids) &&
        obj(v) &&
        v.id === key &&
        key === routineId(v.routineId as string, v.date as string) &&
        title(v.title) &&
        category(v.category) &&
        (v.status === 'done' || v.status === 'skipped') &&
        stamp(v.recordedAt) &&
        rewards[key],
    );
    records[key] = {
      id: key,
      routineId: v.routineId as string,
      date: v.date as string,
      title: v.title,
      category: v.category as Routine['category'],
      status: v.status,
      recordedAt: v.recordedAt,
    };
  }
  for (const [key, v] of Object.entries(value.overrides as Record<string, unknown>)) {
    check(
      occurrenceKey(key, ids) &&
        obj(v) &&
        (v.hiddenForToday === undefined || typeof v.hiddenForToday === 'boolean') &&
        (v.laterAt === undefined || stamp(v.laterAt)),
    );
    overrides[key] = {
      ...(v.hiddenForToday === undefined ? {} : { hiddenForToday: v.hiddenForToday as boolean }),
      ...(v.laterAt ? { laterAt: v.laterAt as string } : {}),
    };
  }
  return {
    routines,
    records,
    overrides,
    rewards,
    introductionDismissed: value.introductionDismissed,
  };
}
export function routineScheduleAt(routine: Routine, day: string) {
  return routine.schedules.filter((s) => s.from <= day).at(-1);
}
export function routinesForDay(data: AppData, day: string) {
  check(isDate(day));
  const weekday = new Date(day + 'T12:00:00').getDay();
  return data.selfCare.routines
    .flatMap((routine) => {
      const id = routineId(routine.id, day),
        record = data.selfCare.records[id],
        schedule = routineScheduleAt(routine, day);
      if (!record && (!schedule?.active || !schedule.days.includes(weekday))) return [];
      return [{ id, date: day, routine, record, schedule, override: data.selfCare.overrides[id] }];
    })
    .sort(
      (a, b) =>
        (a.schedule?.time ?? '99:99').localeCompare(b.schedule?.time ?? '99:99') ||
        a.routine.title.localeCompare(b.routine.title),
    );
}
export type RoutineOccurrence = ReturnType<typeof routinesForDay>[number];
function change(data: AppData, selfCare: SelfCare): AppData {
  return { ...data, selfCare: parseSelfCare(selfCare) };
}
export function saveRoutine(
  data: AppData,
  input: RoutineInput,
  id: string,
  now = new Date(),
  editing = true,
): AppData {
  check(validId(id) && title(input.title), 'Give your routine a name of 1–80 characters.');
  check(
    category(input.category) && daysValid(input.days),
    'Choose a category and at least one day.',
  );
  check(input.time === undefined || isTime(input.time), 'Choose a valid time or leave it blank.');
  check(
    input.activity === undefined || ROUTINE_ACTIVITIES.includes(input.activity),
    'Choose an available activity.',
  );
  const today = dateKey(now),
    previous = data.selfCare.routines.find((r) => r.id === id);
  check(
    editing ? previous && !previous.archived : !previous,
    'This routine is no longer available.',
  );
  check(
    isDate(input.startDate) && (editing || input.startDate >= today),
    'Start today or choose a future date.',
  );
  const from = previous
    ? previous.schedules[0].from > addDays(today, 1)
      ? previous.schedules[0].from
      : addDays(today, 1)
    : input.startDate;
  const schedule = {
    from,
    days: [...input.days].sort((a, b) => a - b),
    active: previous ? previous.schedules.at(-1)!.active : true,
    ...(input.time ? { time: input.time } : {}),
  };
  const routine: Routine = {
    id,
    title: input.title.trim(),
    category: input.category,
    ...(input.activity ? { activity: input.activity } : {}),
    createdAt: previous?.createdAt ?? now.toISOString(),
    archived: false,
    schedules: [...(previous?.schedules.filter((s) => s.from < from) ?? []), schedule],
  };
  return change(data, {
    ...data.selfCare,
    routines: previous
      ? data.selfCare.routines.map((r) => (r.id === id ? routine : r))
      : [...data.selfCare.routines, routine],
    introductionDismissed: true,
  });
}
export function setRoutineStatus(
  data: AppData,
  id: string,
  status: 'active' | 'paused' | 'archived',
  now = new Date(),
): AppData {
  const routine = data.selfCare.routines.find((r) => r.id === id);
  check(routine, 'This routine no longer exists.');
  const today = dateKey(now),
    from = today < routine.schedules[0].from ? routine.schedules[0].from : today;
  const schedule = {
    ...(routineScheduleAt(routine, from) ?? routine.schedules[0]),
    from,
    active: status === 'active',
  };
  return change(data, {
    ...data.selfCare,
    routines: data.selfCare.routines.map((r) =>
      r.id === id
        ? {
            ...r,
            archived: status === 'archived',
            schedules: [
              ...r.schedules.filter((s) => s.from < from),
              schedule,
              ...r.schedules
                .filter((s) => s.from > from)
                .map((s) => ({ ...s, active: status === 'active' })),
            ],
          }
        : r,
    ),
  });
}
export function recordRoutine(
  data: AppData,
  id: string,
  status: RoutineStatus,
  now = new Date(),
): AppData {
  check(status === 'done' || status === 'skipped');
  const day = id.split('@')[1],
    occurrence = routinesForDay(data, day).find((o) => o.id === id);
  check(occurrence, 'This optional routine is no longer scheduled on that day.');
  const rewardDay = dateKey(now),
    previous = data.selfCare.records[id],
    marker = data.selfCare.rewards[id];
  const spent = Object.values(data.selfCare.rewards)
    .filter((m) => m.rewardDay === rewardDay)
    .reduce((sum, m) => sum + m.amount, 0);
  const amount =
    marker || day !== rewardDay
      ? 0
      : Math.max(0, Math.min(5, 15 - spent, 1000000 - data.market.coins));
  const record: RoutineRecord = {
    id,
    routineId: occurrence.routine.id,
    date: day,
    title: previous?.title ?? occurrence.routine.title,
    category: previous?.category ?? occurrence.routine.category,
    status,
    recordedAt: previous?.recordedAt ?? now.toISOString(),
  };
  const next = change(data, {
    ...data.selfCare,
    records: { ...data.selfCare.records, [id]: record },
    rewards: { ...data.selfCare.rewards, [id]: marker ?? { amount, rewardDay } },
  });
  return { ...next, market: { ...data.market, coins: data.market.coins + amount } };
}
export function undoRoutine(data: AppData, id: string): AppData {
  const records = { ...data.selfCare.records };
  delete records[id];
  return change(data, { ...data.selfCare, records });
}
export function laterRoutine(data: AppData, id: string, now = new Date()): AppData {
  check(
    routinesForDay(data, dateKey(now)).some((o) => o.id === id && !o.record),
    'Choose an unrecorded routine for today.',
  );
  return change(data, {
    ...data.selfCare,
    overrides: {
      ...data.selfCare.overrides,
      [id]: {
        ...data.selfCare.overrides[id],
        laterAt: new Date(+now + 60 * 60 * 1000).toISOString(),
      },
    },
  });
}
export function hideRoutinesToday(
  data: AppData,
  ids: string[],
  hide: boolean,
  now = new Date(),
): AppData {
  const allowed = new Set(
    routinesForDay(data, dateKey(now))
      .filter((o) => !o.record)
      .map((o) => o.id),
  );
  check(
    ids.every((id) => allowed.has(id)),
    'The Today list changed. Review it again.',
  );
  const overrides = { ...data.selfCare.overrides };
  for (const id of ids) overrides[id] = { ...overrides[id], hiddenForToday: hide };
  return change(data, { ...data.selfCare, overrides });
}
