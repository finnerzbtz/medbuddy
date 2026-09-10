import type { AnimationName, AppData, CareDay, Dose, FoodId } from '../types/index';
import { addDays, dateKey, dosesForDay, scheduledAt } from './schedule';

import { FOODS } from './catalog';
import { foodQuantity } from './market';
export { FOODS } from './catalog';
export const STATES: {
  id: AnimationName;
  code: string;
  label: string;
  message: string;
}[] = [
  {
    id: 'idle',
    code: 'idle',
    label: 'Content',
    message: 'My favourite place is here with you.',
  },
  { id: 'wave', code: 'hello', label: 'Hello!', message: 'Oh! There you are!' },
  {
    id: 'happy',
    code: 'happy',
    label: 'Happy',
    message: 'Today feels a little brighter.',
  },
  {
    id: 'celebrating',
    code: 'celebrate',
    label: 'Celebrating',
    message: 'A little happy dance for us!',
  },
  {
    id: 'worried',
    code: 'sad',
    label: 'Missing you',
    message: 'A little quiet. A little company would be nice.',
  },
  {
    id: 'sick',
    code: 'poorly',
    label: 'Feeling poorly',
    message: 'A low-energy day. Let’s take it gently.',
  },
  {
    id: 'critical',
    code: 'rest',
    label: 'Needs extra care',
    message: 'Tucked up and taking things slowly.',
  },
  {
    id: 'recovering',
    code: 'better',
    label: 'Perking up',
    message: 'It’s good to have you back.',
  },
  {
    id: 'walk_to_cushion',
    code: 'walk',
    label: 'Exploring',
    message: 'Just checking on my little world.',
  },
  {
    id: 'rest',
    code: 'sleep',
    label: 'Sleepy',
    message: 'Five more minutes… zzz.',
  },
  {
    id: 'feeding',
    code: 'feed',
    label: 'Snack time',
    message: 'Mmm. You remembered my favourite thing!',
  },
  {
    id: 'petting',
    code: 'cuddle',
    label: 'Loved',
    message: 'This is a very good cuddle.',
  },
  {
    id: 'dance',
    code: 'dance',
    label: 'Playful',
    message: 'Look at my tiny dancing feet!',
  },
  {
    id: 'curious',
    code: 'curious',
    label: 'Curious',
    message: 'What are we doing today?',
  },
  {
    id: 'stretch',
    code: 'stretch',
    label: 'Big stretch',
    message: 'A biiig stretch for a little Blobby.',
  },
  {
    id: 'tea',
    code: 'tea',
    label: 'Tea time',
    message: 'A warm cup, and a moment to ourselves.',
  },
  {
    id: 'tend',
    code: 'garden',
    label: 'Little gardener',
    message: 'A little water. A little more life.',
  },
  {
    id: 'ball',
    code: 'ball',
    label: 'Ball time',
    message: 'Catch me if you can, little ball!',
  },
  {
    id: 'window',
    code: 'window',
    label: 'Daydreaming',
    message: 'There’s a whole little world out there.',
  },
];
export const emptyCareDay = (): CareDay => ({
  spent: 0,
  feeds: 0,
  petted: false,
  played: false,
});
export function careForDay(data: AppData, day = dateKey()): CareDay {
  return data.care.days[day] ?? emptyCareDay();
}
export function treatsAvailable(data: AppData, day = dateKey()): number {
  return FOODS.reduce((total, food) => total + foodQuantity(data, food.id, day), 0);
}
export function friendship(data: AppData) {
  const xp = data.care.xp + Object.keys(data.records).length * 10;
  return { xp, level: Math.floor(xp / 100) + 1, progress: xp % 100 };
}
function missingCompanionCheckIns(data: AppData, now: Date): Dose[] {
  const today = dateKey(now);
  const latestCheck = Math.max(
    0,
    ...Object.values(data.records).map((r) => Date.parse(r.recordedAt)),
  );
  const activeIds = new Set(
    data.medications.filter((m) => !m.archived && m.schedules.at(-1)?.active).map((m) => m.id),
  );
  return Array.from({ length: 7 }, (_, i) => dosesForDay(data, addDays(today, -i)))
    .flat()
    .filter(
      (dose) =>
        activeIds.has(dose.medicationId) &&
        !dose.record &&
        +scheduledAt(dose) > latestCheck &&
        +scheduledAt(dose) <= +now,
    )
    .sort((a, b) => +scheduledAt(a) - +scheduledAt(b));
}

export function companionCheckIn(data: AppData, now = new Date()): Dose | undefined {
  const activeIds = new Set(
    data.medications.filter((m) => !m.archived && m.schedules.at(-1)?.active).map((m) => m.id),
  );
  const snoozed = (dose: Dose) =>
    Number(Date.parse(data.reminders[dose.id]?.snoozedUntil ?? '') > +now);
  const today = dosesForDay(data, dateKey(now))
    .filter((dose) => activeIds.has(dose.medicationId) && !dose.record && scheduledAt(dose) <= now)
    .sort((a, b) => snoozed(a) - snoozed(b) || +scheduledAt(a) - +scheduledAt(b));
  // Prefer an actionable dose today. Historical gaps only invite a review of that record.
  return today[0] ?? missingCompanionCheckIns(data, now)[0];
}

export function baselineMedicationMood(data: AppData, now = new Date()): AnimationName {
  const today = dateKey(now);
  // A later medication record resets earlier gaps; opening the app alone does not.
  const missing = missingCompanionCheckIns(data, now)[0];
  const oldest = missing ? +scheduledAt(missing) : +now;
  const hours = (now.getTime() - oldest) / 3600000;
  if (hours >= 72) return 'critical';
  if (hours >= 24) return 'sick';
  if (hours >= 2) return 'worried';
  const doses = dosesForDay(data, today);
  return doses.length && doses.every((d) => d.record) ? 'happy' : 'idle';
}
export function foodById(id: FoodId) {
  return FOODS.find((food) => food.id === id);
}

// The production policy is unchanged. Self-care is deliberately not an input to it.
export const companionMood = baselineMedicationMood;
export function presentedCompanionMood(
  data: AppData,
  now = new Date(),
  policy: 'baseline' | 'capped-preview' = 'baseline',
): AnimationName {
  if (data.preferences.gentleMoods) return 'idle';
  const mood = baselineMedicationMood(data, now);
  return policy === 'capped-preview' && (mood === 'sick' || mood === 'critical') ? 'worried' : mood;
}
