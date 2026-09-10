import { emptySelfCare, parseSelfCare } from './routines';
import { isBlobbyVoice } from './voices';
import { DEFAULT_ROOM, ROOM_COLLECTION, ROOM_SLOTS } from './room';
import { FOODS, OUTFITS, PRODUCTS, starterMarket } from './catalog';
import type { AppData, DoseRecord, Medication, Schedule, CompanionCare } from '../types/index';
import {
  dateKey,
  doseId,
  formatDosage,
  isDate,
  isPositiveNumber,
  isTime,
  ROOM_ITEMS,
} from './schedule';
export const STORAGE_KEY = 'reminduh-mvp-v1';
export const MIGRATION_BACKUP_KEY = STORAGE_KEY + ':before-v2';
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
export function emptyData(): AppData {
  return {
    schemaVersion: 2,
    selfCare: emptySelfCare(),
    onboarded: false,
    profile: { name: '', petName: 'Blobby' },
    medications: [],
    records: {},
    outfit: 'base',
    voice: 'cloud',
    room: { ...DEFAULT_ROOM },
    hiddenGroups: [],
    preferences: {
      reducedMotion: false,
      staticScene: false,
      reminders: false,
      lampOn: true,
      pauseScene: false,
      hideRewards: false,
      gentleMoods: false,
      relaxedGarden: true,
      showWisdom: true,
    },
    reminders: {},
    care: { xp: 0, days: {} },
    market: starterMarket(),
    updatedAt: new Date().toISOString(),
  };
}
function assert(
  condition: unknown,
  message = 'This is not a valid Reminduh backup.',
): asserts condition {
  if (!condition) throw new Error(message);
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const string = (v: unknown, max = 500): v is string => typeof v === 'string' && v.length <= max;
const integer = (v: unknown, min = 0, max = 100000): v is number =>
  Number.isInteger(v) && Number(v) >= min && Number(v) <= max;
const timestamp = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v));
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(v);
const color = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
function parseDosage(value: Record<string, unknown>) {
  // Version 1 also accepts the original free-text dose, without guessing its units.
  if (value.strengthMg === undefined && value.tabletsPerDose === undefined)
    return { dosage: value.dosage as string };
  assert(isPositiveNumber(value.strengthMg) && isPositiveNumber(value.tabletsPerDose));
  return {
    dosage: formatDosage(value.strengthMg, value.tabletsPerDose),
    strengthMg: value.strengthMg,
    tabletsPerDose: value.tabletsPerDose,
  };
}
function parseSchedule(value: unknown): Schedule {
  assert(object(value) && isDate(value.from) && typeof value.active === 'boolean');
  assert(
    Array.isArray(value.times) &&
      value.times.length > 0 &&
      value.times.length <= 8 &&
      value.times.every(isTime) &&
      new Set(value.times).size === value.times.length,
  );
  assert(
    Array.isArray(value.days) &&
      value.days.length > 0 &&
      value.days.length <= 7 &&
      value.days.every((d) => integer(d, 0, 6)) &&
      new Set(value.days).size === value.days.length,
  );
  return {
    from: value.from,
    active: value.active,
    times: [...value.times].sort(),
    days: [...value.days],
  };
}
function parseCare(value: unknown): CompanionCare {
  if (value === undefined) return { xp: 0, days: {} };
  assert(object(value) && integer(value.xp, 0, 1000000000) && object(value.days));
  assert(Object.keys(value.days).length <= 400);
  const days: CompanionCare['days'] = {};
  for (const [day, entry] of Object.entries(value.days)) {
    assert(
      isDate(day) &&
        object(entry) &&
        integer(entry.spent, 0, 9) &&
        integer(entry.feeds, 0, 100000) &&
        typeof entry.petted === 'boolean' &&
        typeof entry.played === 'boolean',
    );
    days[day] = {
      spent: entry.spent,
      feeds: entry.feeds,
      petted: entry.petted,
      played: entry.played,
    };
  }
  assert(value.lastFedAt === undefined || timestamp(value.lastFedAt));
  assert(value.lastFood === undefined || FOODS.some((food) => food.id === value.lastFood));
  return {
    xp: value.xp,
    days,
    ...(value.lastFedAt ? { lastFedAt: value.lastFedAt as string } : {}),
    ...(value.lastFood ? { lastFood: value.lastFood as CompanionCare['lastFood'] } : {}),
  };
}
function parseMarket(value: unknown): AppData['market'] {
  if (value === undefined) return starterMarket();
  assert(object(value) && integer(value.coins, 0, 1000000) && object(value.foods));
  const foods = {} as AppData['market']['foods'];
  for (const food of FOODS) {
    assert(integer(value.foods[food.id], 0, 9999));
    foods[food.id] = value.foods[food.id] as number;
  }
  assert(
    Array.isArray(value.ownedOutfits) &&
      value.ownedOutfits.length <= OUTFITS.length &&
      value.ownedOutfits.includes('base') &&
      value.ownedOutfits.every((id) => OUTFITS.some((o) => o.id === id)) &&
      new Set(value.ownedOutfits).size === value.ownedOutfits.length,
  );
  const ownedRoomItems = value.ownedRoomItems ?? Object.values(DEFAULT_ROOM);
  assert(
    Array.isArray(ownedRoomItems) &&
      ownedRoomItems.length <= ROOM_COLLECTION.length &&
      ownedRoomItems.every((item) => ROOM_COLLECTION.some((r) => r.id === item)) &&
      Object.values(DEFAULT_ROOM).every((item) => ownedRoomItems.includes(item)) &&
      new Set(ownedRoomItems).size === ownedRoomItems.length,
  );
  assert(value.lastGiftDay === undefined || isDate(value.lastGiftDay));
  assert(Array.isArray(value.orders) && value.orders.length <= 200);
  const checkInRewards: Record<string, number> = {};
  if (value.checkInRewards !== undefined) {
    assert(object(value.checkInRewards) && Object.keys(value.checkInRewards).length <= 100000);
    for (const [key, amount] of Object.entries(value.checkInRewards)) {
      const [medication, day, time] = key.split('@');
      assert(
        id(medication) &&
          isDate(day) &&
          isTime(time) &&
          key === doseId(medication, day, time) &&
          integer(amount, 0, 10),
      );
      checkInRewards[key] = amount;
    }
  }
  const orders = value.orders.map((order) => {
    assert(
      object(order) &&
        id(order.id) &&
        PRODUCTS.some((p) => p.id === order.productId) &&
        integer(order.price, 0, 1000000) &&
        integer(order.quantity, 1, 9999) &&
        timestamp(order.createdAt),
    );
    return {
      id: order.id,
      productId: order.productId as string,
      price: order.price,
      quantity: order.quantity,
      createdAt: order.createdAt,
    } as AppData['market']['orders'][number];
  });
  assert(new Set(orders.map((order) => order.id)).size === orders.length);
  return {
    coins: value.coins,
    checkInRewards,
    foods,
    ownedOutfits: [...value.ownedOutfits] as AppData['outfit'][],
    ownedRoomItems: [...ownedRoomItems] as AppData['market']['ownedRoomItems'],
    orders,
    ...(value.lastGiftDay ? { lastGiftDay: value.lastGiftDay as string } : {}),
  };
}
export function parseData(value: unknown): AppData {
  assert(
    object(value) && (value.schemaVersion === 1 || value.schemaVersion === 2),
    'This data needs a newer version of Reminduh. Update the app before opening it. Your saved copy has been kept.',
  );
  assert(
    typeof value.onboarded === 'boolean' &&
      object(value.profile) &&
      string(value.profile.name, 40) &&
      string(value.profile.petName, 40) &&
      value.profile.petName.trim(),
  );
  assert(Array.isArray(value.medications) && value.medications.length <= 300);
  const medications: Medication[] = value.medications.map((v) => {
    assert(
      object(v) &&
        id(v.id) &&
        string(v.name, 80) &&
        v.name.trim() &&
        string(v.dosage, 80) &&
        v.dosage.trim() &&
        string(v.instructions) &&
        color(v.color),
    );
    assert(timestamp(v.createdAt) && typeof v.archived === 'boolean' && integer(v.refillAt));
    assert(Array.isArray(v.schedules) && v.schedules.length > 0 && v.schedules.length <= 2000);
    const schedules = v.schedules.map(parseSchedule);
    assert(
      schedules.every((s, i) => !i || s.from > schedules[i - 1].from),
      'Schedule history is out of order.',
    );
    assert(
      v.stock === null ||
        (object(v.stock) &&
          integer(v.stock.quantity) &&
          Array.isArray(v.stock.baselineTakenIds) &&
          v.stock.baselineTakenIds.length <= 50000 &&
          v.stock.baselineTakenIds.every((x) => string(x, 120))),
    );
    return {
      id: v.id,
      name: v.name,
      ...parseDosage(v),
      instructions: v.instructions,
      color: v.color,
      createdAt: v.createdAt,
      archived: v.archived,
      schedules,
      stock:
        v.stock === null
          ? null
          : {
              quantity: v.stock.quantity as number,
              baselineTakenIds: [...(v.stock.baselineTakenIds as string[])],
            },
      refillAt: v.refillAt,
    };
  });
  assert(
    new Set(medications.map((m) => m.id)).size === medications.length,
    'Duplicate medication IDs in backup.',
  );
  const medIds = new Set(medications.map((m) => m.id));
  assert(object(value.records) && Object.keys(value.records).length <= 50000);
  const records: Record<string, DoseRecord> = {};
  for (const [key, v] of Object.entries(value.records)) {
    assert(
      object(v) &&
        id(v.medicationId) &&
        medIds.has(v.medicationId) &&
        isDate(v.date) &&
        isTime(v.time),
    );
    assert(key === doseId(v.medicationId, v.date, v.time) && v.id === key);
    assert(v.status === 'taken' || v.status === 'skipped');
    assert(
      string(v.name, 80) &&
        string(v.dosage, 80) &&
        string(v.instructions) &&
        string(v.note) &&
        color(v.color) &&
        timestamp(v.recordedAt),
    );
    records[key] = {
      id: key,
      medicationId: v.medicationId,
      date: v.date,
      time: v.time,
      status: v.status,
      name: v.name,
      ...parseDosage(v),
      instructions: v.instructions,
      note: v.note,
      color: v.color,
      recordedAt: v.recordedAt,
    };
  }
  assert(OUTFITS.some((outfit) => outfit.id === value.outfit));
  const market = parseMarket(value.market);
  // Older recorded doses are acknowledged, without a surprise retrospective grant.
  for (const key of Object.keys(records)) market.checkInRewards[key] ??= 0;
  assert(market.ownedOutfits.includes(value.outfit as AppData['outfit']));
  const room = value.room === undefined ? { ...DEFAULT_ROOM } : value.room;
  assert(
    object(room) &&
      ROOM_SLOTS.every((slot) =>
        ROOM_COLLECTION.some(
          (item) =>
            item.id === room[slot.id] &&
            item.slot === slot.id &&
            market.ownedRoomItems.includes(item.id),
        ),
      ),
  );
  assert(
    Array.isArray(value.hiddenGroups) &&
      value.hiddenGroups.every((v) => ROOM_ITEMS.some((item) => item.id === v)),
  );
  assert(value.voice === undefined || isBlobbyVoice(value.voice));
  const preferences = value.preferences;
  assert(
    object(preferences) &&
      (preferences.lampOn === undefined || typeof preferences.lampOn === 'boolean'),
  );
  assert(
    object(preferences) &&
      ['reducedMotion', 'staticScene', 'reminders'].every(
        (k) => typeof preferences[k] === 'boolean',
      ),
  );
  assert(
    ['pauseScene', 'hideRewards', 'gentleMoods', 'relaxedGarden', 'showWisdom'].every(
      (key) => preferences[key] === undefined || typeof preferences[key] === 'boolean',
    ),
  );
  assert(
    object(value.reminders) &&
      Object.keys(value.reminders).length <= 50000 &&
      timestamp(value.updatedAt),
  );
  const reminders: AppData['reminders'] = {};
  for (const [key, v] of Object.entries(value.reminders)) {
    const [medId, day, time] = key.split('@');
    assert(
      medIds.has(medId) &&
        isDate(day) &&
        isTime(time) &&
        key === doseId(medId, day, time) &&
        object(v),
    );
    assert(v.snoozedUntil === undefined || timestamp(v.snoozedUntil));
    assert(v.notifiedAt === undefined || timestamp(v.notifiedAt));
    reminders[key] = {
      ...(v.snoozedUntil ? { snoozedUntil: v.snoozedUntil as string } : {}),
      ...(v.notifiedAt ? { notifiedAt: v.notifiedAt as string } : {}),
    };
  }
  return {
    schemaVersion: 2,
    selfCare: value.schemaVersion === 1 ? emptySelfCare() : parseSelfCare(value.selfCare),
    onboarded: value.onboarded,
    profile: { name: value.profile.name, petName: value.profile.petName },
    medications,
    records,
    outfit: value.outfit as AppData['outfit'],
    voice: value.voice === undefined ? 'cloud' : (value.voice as AppData['voice']),
    room: Object.fromEntries(
      ROOM_SLOTS.map((slot) => [slot.id, room[slot.id]]),
    ) as unknown as AppData['room'],
    hiddenGroups: [...new Set(value.hiddenGroups as string[])],
    preferences: {
      reducedMotion: preferences.reducedMotion as boolean,
      staticScene: preferences.staticScene as boolean,
      reminders: preferences.reminders as boolean,
      lampOn: preferences.lampOn !== false,
      pauseScene: preferences.pauseScene === true,
      hideRewards: preferences.hideRewards === true,
      gentleMoods: preferences.gentleMoods === true,
      relaxedGarden: preferences.relaxedGarden !== false,
      showWisdom: preferences.showWisdom !== false,
    },
    reminders,
    care: parseCare(value.care),
    market,
    updatedAt: value.updatedAt,
  };
}
export function parseBackup(text: string): AppData {
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES)
    throw new Error('This file is too large. Choose a Reminduh backup smaller than 10 MB.');
  const value: unknown = JSON.parse(text);
  if (object(value) && value.format === 'reminduh-backup')
    assert(
      value.schemaVersion === undefined || value.schemaVersion === 1 || value.schemaVersion === 2,
      'This backup needs a newer version of Reminduh. Your saved copy has been kept.',
    );
  const data = parseData(object(value) && value.format === 'reminduh-backup' ? value.data : value);
  if (Object.values(data.records).some((r) => r.date > dateKey()))
    throw new Error(
      'This backup contains future check-ins. Check your device date or choose another backup.',
    );
  return data;
}
export function backupText(data: AppData): string {
  return JSON.stringify(
    { format: 'reminduh-backup', schemaVersion: 2, exportedAt: new Date().toISOString(), data },
    null,
    2,
  );
}

// Validate first; retain the exact original (including account binding) before any upgrade.
export function saveLocalData(serialized: string) {
  parseData(JSON.parse(serialized));
  const previous = localStorage.getItem(STORAGE_KEY);
  if (previous) {
    let old: { schemaVersion?: number } = {};
    try {
      old = JSON.parse(previous);
    } catch {
      /* Explicit recovery can replace damaged data. */
    }
    if (Number(old?.schemaVersion) > 2)
      throw new Error('Update Reminduh before changing this saved data.');
    if (old?.schemaVersion === 1) {
      parseData(old);
      localStorage.setItem(MIGRATION_BACKUP_KEY, previous);
    }
  }
  localStorage.setItem(STORAGE_KEY, serialized);
}
