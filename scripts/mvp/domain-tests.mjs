import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
process.env.TZ = 'Europe/London';
const out = path.resolve('rebuild/generated/tests');
await mkdir(out, { recursive: true });
await build({
  entryPoints: {
    schedule: 'src/domain/schedule.ts',
    companion: 'src/domain/companion.ts',
    choreography: 'src/domain/choreography.ts',
    environment: 'src/domain/environment.ts',
    motion: 'src/domain/motion.ts',
    tea: 'src/domain/tea.ts',
    garden: 'src/domain/garden.ts',
    reminders: 'src/domain/reminders.ts',
    storage: 'src/domain/storage.ts',
    exports: 'src/domain/exports.ts',
    store: 'src/stores/appStore.ts',
    roomCollection: 'src/domain/room.ts',
    sand: 'src/domain/sand.ts',
    wisdom: 'src/domain/wisdom.ts',
  },
  outdir: out,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  define: { 'import.meta.env.DEV': 'false' },
});
const load = (name) => import(pathToFileURL(path.join(out, name + '.js')).href);
const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};
const RealDate = Date;
let clock = '2026-09-05T09:00:00+01:00';
globalThis.Date = class extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : [clock]));
  }
  static now() {
    return new RealDate(clock).getTime();
  }
};
const { SandField } = await load('sand');
const wisdom = await load('wisdom');
const s = await load('schedule'),
  storage = await load('storage'),
  roomCollection = await load('roomCollection'),
  companion = await load('companion'),
  choreography = await load('choreography'),
  environment = await load('environment'),
  motion = await load('motion'),
  tea = await load('tea'),
  garden = await load('garden'),
  reminders = await load('reminders'),
  exports = await load('exports'),
  { useAppStore } = await load('store');
const state = () => useAppStore.getState(),
  data = () => state().data;
const cases = [];
function test(name, fn) {
  fn();
  cases.push(name);
}
function success(result) {
  assert.equal(result.ok, true, result.error);
}
const input = {
  name: 'Test medicine',
  strengthMg: 10,
  tabletsPerDose: 2,
  instructions: 'User-entered instructions',
  color: '#738962',
  times: ['08:00', '20:00'],
  days: [0, 1, 2, 3, 4, 5, 6],
  startDate: '2026-09-05',
  supply: 30,
  refillAt: 5,
};
let id, first;
test('Fresh install has no fabricated medication, dose or streak', () => {
  assert.equal(data().medications.length, 0);
  assert.equal(s.checkInStreak(data()), 0);
  assert.equal(s.dosesForDay(data(), s.dateKey()).length, 0);
});
test('Medication validation rejects duplicate times, no days and invalid supply', () => {
  assert.match(s.validateMedication({ ...input, times: ['08:00', '08:00'] }), /different/);
  assert.ok(s.validateMedication({ ...input, days: [] }));
  assert.ok(s.validateMedication({ ...input, supply: -1 }));
  assert.ok(s.validateMedication({ ...input, name: '  ' }));
  assert.ok(s.validateMedication({ ...input, startDate: '2026-02-30' }));
});
test('Strength and tablet count require positive finite numbers, including decimals', () => {
  for (const field of ['strengthMg', 'tabletsPerDose']) {
    for (const value of [null, undefined, '', '10', 0, -1, NaN, Infinity]) {
      assert.ok(s.validateMedication({ ...input, [field]: value }), field + ': ' + value);
      assert.equal(state().saveMedication({ ...input, [field]: value }).ok, false);
    }
  }
  assert.equal(s.validateMedication({ ...input, strengthMg: 12.5, tabletsPerDose: 0.5 }), null);
  assert.equal(data().medications.length, 0, 'Invalid fields cannot create a medication');
});
test('Multiple daily doses get stable independent identifiers', () => {
  success(state().saveMedication(input));
  id = data().medications[0].id;
  first = s.dosesForDay(data(), '2026-09-05')[0].id;
  assert.equal(s.dosesForDay(data(), '2026-09-05').length, 2);
  assert.equal(data().medications[0].dosage, '2 tablets · 10 mg per tablet');
  assert.equal(s.findDose(data(), first).strengthMg, 10);
  assert.equal(s.findDose(data(), first).tabletsPerDose, 2);
  assert.equal(s.dosesForDay(data(), '2026-09-04').length, 0);
});
test('Duplicate check-ins do not duplicate records, stock or streak', () => {
  success(state().recordDose(first, 'taken'));
  success(state().recordDose(first, 'taken'));
  assert.equal(Object.keys(data().records).length, 1);
  assert.equal(s.remainingStock(data(), data().medications[0]), 29);
  assert.equal(s.checkInStreak(data()), 1);
});
test('Undo and skip preserve accurate supply, and skipped → taken decrements once', () => {
  success(state().undoDose(first));
  assert.equal(s.remainingStock(data(), data().medications[0]), 30);
  success(state().recordDose(first, 'skipped', 'User chose skip'));
  assert.equal(s.remainingStock(data(), data().medications[0]), 30);
  success(state().recordDose(first, 'taken'));
  assert.equal(s.remainingStock(data(), data().medications[0]), 29);
});
test('Schedule edits start tomorrow and do not introduce extra doses today', () => {
  success(
    state().saveMedication(
      {
        ...input,
        name: 'Renamed medicine',
        strengthMg: 12.5,
        tabletsPerDose: 0.5,
        times: ['09:00', '21:00'],
        supply: 29,
      },
      id,
    ),
  );
  assert.deepEqual(
    s.dosesForDay(data(), '2026-09-05').map((d) => d.time),
    ['08:00', '20:00'],
  );
  assert.deepEqual(
    s.dosesForDay(data(), '2026-09-06').map((d) => d.time),
    ['09:00', '21:00'],
  );
  assert.equal(data().records[first].name, 'Test medicine');
  assert.equal(data().records[first].dosage, '2 tablets · 10 mg per tablet');
  assert.equal(data().records[first].strengthMg, 10);
  assert.equal(data().records[first].tabletsPerDose, 2);
  const pending = s.dosesForDay(data(), '2026-09-06')[0];
  assert.equal(pending.dosage, '0.5 tablets · 12.5 mg per tablet');
  assert.equal(pending.strengthMg, 12.5);
  assert.equal(pending.tabletsPerDose, 0.5);
  success(state().undoDose(first));
  assert.equal(
    s.remainingStock(data(), data().medications[0]),
    30,
    'editing metadata must not reset inventory baseline',
  );
});
test('Pause/resume removes pending doses while preserving records and future edits', () => {
  success(state().recordDose(first, 'taken'));
  success(state().setMedicationStatus(id, 'paused'));
  assert.equal(s.dosesForDay(data(), '2026-09-05').length, 1);
  assert.equal(s.dosesForDay(data(), '2026-09-06').length, 0);
  success(state().setMedicationStatus(id, 'active'));
  assert.deepEqual(
    s.dosesForDay(data(), '2026-09-05').map((d) => d.time),
    ['08:00', '20:00'],
  );
  assert.deepEqual(
    s.dosesForDay(data(), '2026-09-06').map((d) => d.time),
    ['09:00', '21:00'],
  );
});
test('Future check-ins are rejected and snooze does not record a dose', () => {
  const future = s.dosesForDay(data(), '2026-09-06')[0];
  assert.equal(state().recordDose(future.id, 'taken').ok, false);
  const pending = s.dosesForDay(data(), '2026-09-05').find((d) => !d.record);
  success(state().snoozeDose(pending.id, 10));
  assert.equal(data().records[pending.id], undefined);
  assert.ok(data().reminders[pending.id].snoozedUntil);
});
test('A new calendar day resets the schedule and adds at most one streak day', () => {
  clock = '2026-09-06T10:00:00+01:00';
  const doses = s.dosesForDay(data(), s.dateKey());
  assert.equal(doses.filter((d) => d.record).length, 0);
  success(state().recordDose(doses[0].id, 'taken'));
  success(state().recordDose(doses[1].id, 'skipped'));
  assert.equal(s.checkInStreak(data()), 2);
});
test('Archive preserves past schedules and recorded history', () => {
  success(state().setMedicationStatus(id, 'archived'));
  assert.equal(s.dosesForDay(data(), '2026-09-05').length, 2);
  assert.equal(s.dosesForDay(data(), '2026-09-07').length, 0);
  assert.equal(Object.keys(data().records).length, 3);
});
test('Future-start medication stays in the future through pause/resume', () => {
  success(
    state().saveMedication({
      ...input,
      name: 'Future schedule',
      startDate: '2026-11-02',
      times: ['07:00'],
      days: [1],
    }),
  );
  const med = data().medications.at(-1);
  success(state().setMedicationStatus(med.id, 'paused'));
  success(state().setMedicationStatus(med.id, 'active'));
  assert.equal(
    s.dosesForDay(data(), '2026-09-06').filter((d) => d.medicationId === med.id).length,
    0,
  );
  assert.equal(s.nextDose(data()).date, '2026-11-02');
});
test('Selected weekdays and daylight-saving calendar arithmetic stay local', () => {
  assert.equal(s.addDays('2026-03-28', 1), '2026-03-29');
  assert.equal(s.addDays('2026-10-24', 1), '2026-10-25');
  assert.equal(s.dateKey(new RealDate('2026-07-01T23:30:00Z')), '2026-07-02');
  assert.equal(s.dosesForDay(data(), '2026-11-03').length, 0);
  assert.equal(s.dosesForDay(data(), '2026-11-09').length, 1);
});
test('Refilling establishes a fresh baseline; undo only restores later consumption', () => {
  clock = '2026-09-07T10:00:00+01:00';
  success(state().setMedicationStatus(id, 'active'));
  success(state().setSupply(id, 20));
  success(state().undoDose(first));
  assert.equal(s.remainingStock(data(), data().medications[0]), 20);
  const d = s.dosesForDay(data(), s.dateKey()).find((d) => d.medicationId === id);
  success(state().recordDose(d.id, 'taken'));
  assert.equal(s.remainingStock(data(), data().medications[0]), 19);
  success(state().undoDose(d.id));
  assert.equal(s.remainingStock(data(), data().medications[0]), 20);
});
test('Backups round-trip and reject malformed or incompatible schemas', () => {
  const parsed = storage.parseBackup(storage.backupText(data()));
  assert.deepEqual(parsed, data());
  assert.throws(() => storage.parseBackup('not json'));
  assert.throws(() => storage.parseBackup('{"schemaVersion":42}'));
  const bad = structuredClone(data());
  bad.medications[0].schedules[0].times = ['99:99'];
  assert.throws(() => storage.parseData(bad));
  const wrong = structuredClone(data());
  Object.defineProperty(wrong.records, '__proto__', { value: { name: 'no' }, enumerable: true });
  assert.throws(() => storage.parseData(wrong));
});
test('Legacy free-text doses survive loading and backup without guessed strength or quantity', () => {
  const legacy = structuredClone(data());
  const entries = [...legacy.medications, ...Object.values(legacy.records)];
  for (const entry of entries) {
    delete entry.strengthMg;
    delete entry.tabletsPerDose;
    entry.dosage = 'Original dose as entered';
  }
  const parsed = storage.parseBackup(storage.backupText(legacy));
  assert.deepEqual(parsed, legacy);
  assert.equal(s.dosesForDay(parsed, '2026-09-06')[0].dosage, 'Original dose as entered');
  assert.equal(s.dosesForDay(parsed, '2026-09-06')[0].strengthMg, undefined);
});
test('Backups reject partial, invalid or non-numeric structured dose fields', () => {
  for (const target of ['medications', 'records']) {
    for (const field of ['strengthMg', 'tabletsPerDose']) {
      for (const value of [undefined, null, 0, -2, '10', Infinity]) {
        const invalid = structuredClone(data());
        const entry = Object.values(invalid[target])[0];
        entry[field] = value;
        assert.throws(() => storage.parseData(invalid), target + '.' + field);
      }
    }
  }
});
test('CSV includes separate numeric strength and tablet count from recorded snapshots', () => {
  const csv = exports.csvText(data());
  assert.ok(csv.includes('"Strength per tablet (mg)","Tablets per dose"'));
  assert.ok(csv.includes('"0.5 tablets · 12.5 mg per tablet","12.5","0.5"'));
});
test('CSV escapes cells that could otherwise run spreadsheet formulas', () => {
  const example = structuredClone(data()),
    record = Object.values(example.records)[0];
  record.name = '=SUM(1,2)';
  record.note = '@danger\n"quoted"';
  const csv = exports.csvText(example);
  assert.ok(csv.includes("'=SUM(1,2)"));
  assert.ok(csv.includes("'@danger"));
  assert.ok(csv.includes('""quoted""'));
});
test('Calendar exports recurring local-time events with alarms and folded lines', () => {
  const ics = exports.calendarText(data());
  assert.ok(ics.includes('BEGIN:VALARM'));
  assert.ok(ics.includes('RRULE:FREQ=WEEKLY;BYDAY=MO'));
  assert.ok(ics.includes('DTSTART:20261102T070000'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75);
});
test('Calendar schedule changes keep today’s remaining dose and start new times tomorrow', () => {
  const example = storage.emptyData(),
    med = structuredClone(data().medications[0]);
  med.archived = false;
  med.schedules = [
    { from: '2026-09-07', times: ['08:00', '20:00'], days: [0, 1, 2, 3, 4, 5, 6], active: true },
    { from: '2026-09-08', times: ['09:00', '21:00'], days: [0, 1, 2, 3, 4, 5, 6], active: true },
  ];
  example.medications = [med];
  const ics = exports.calendarText(example);
  assert.equal(ics.split('BEGIN:VEVENT').length - 1, 3);
  assert.ok(ics.includes('DTSTART:20260907T200000'));
  assert.ok(ics.includes('UNTIL=20260907T235959'));
  assert.ok(ics.includes('DTSTART:20260908T090000'));
  assert.ok(!ics.includes('DTSTART:20260907T080000'));
});
test('Corrupt saved data is preserved and does not get silently overwritten', () => {
  const good = storage.backupText(data());
  memory.set(storage.STORAGE_KEY, 'corrupt');
  state().sync();
  assert.ok(state().storageError);
  assert.equal(state().setProfile('New', 'Pet').ok, false);
  assert.equal(memory.get(storage.STORAGE_KEY), 'corrupt');
  success(state().restore(storage.parseBackup(good)));
  assert.equal(state().storageError, '');
});
test('Damaged account metadata preserves records until an explicit backup restore', () => {
  const good = storage.backupText(data());
  const broken = JSON.stringify({ ...data(), _cloud: { ownerId: 'broken' } });
  memory.set(storage.STORAGE_KEY, broken);
  state().sync();
  assert.ok(state().storageError);
  assert.equal(state().setProfile('Accidental edit', 'Pet').ok, false);
  assert.equal(memory.get(storage.STORAGE_KEY), broken);
  success(state().restore(storage.parseBackup(good)));
  assert.equal(state().storageError, '');
  assert.equal(state().cloudOwner, null);
  assert.equal(JSON.parse(memory.get(storage.STORAGE_KEY))._cloud, undefined);
});
test('A stale account view cannot save into a different account', () => {
  const original = memory.get(storage.STORAGE_KEY);
  const scoped = {
    ...data(),
    _cloud: {
      ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      email: 'synthetic@example.invalid',
      revision: 0,
      hash: '',
      syncedAt: null,
    },
  };
  memory.set(storage.STORAGE_KEY, JSON.stringify(scoped));
  assert.equal(state().setProfile('Wrong account', 'Pet').ok, false);
  assert.equal(JSON.parse(memory.get(storage.STORAGE_KEY)).profile.name, scoped.profile.name);
  memory.set(storage.STORAGE_KEY, original);
  state().sync();
});
test('Storage failure reports failure and leaves in-memory data unchanged', () => {
  const before = data();
  const write = localStorage.setItem;
  localStorage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  assert.equal(state().setOutfit('raincoat').ok, false);
  assert.equal(data(), before);
  assert.ok(state().storageError);
  localStorage.setItem = write;
  success(state().setOutfit('raincoat'));
});
test('Restoring turns notifications off until the user enables them', () => {
  const replacement = structuredClone(data());
  replacement.preferences.reminders = true;
  success(state().restore(replacement));
  assert.equal(data().preferences.reminders, false);
});
test('Older backups initialise a pantry without changing any existing records', () => {
  const legacy = structuredClone(data());
  delete legacy.care;
  const migrated = storage.parseData(legacy);
  assert.deepEqual(migrated.care, { xp: 0, days: {} });
  assert.deepEqual(migrated.records, legacy.records);
});
test('State previews never mutate records, friendship or treats', () => {
  const original = JSON.stringify(data());
  for (const { id } of companion.STATES) {
    state().previewState(id);
    assert.equal(state().previewAnimation, id);
    assert.equal(JSON.stringify(data()), original);
  }
  state().previewState(null);
  assert.equal(state().previewAnimation, null);
});
test('Feeding consumes one snack, enforces cooldown and preserves the rest of the pantry', () => {
  clock = '2026-09-05T09:00:00+01:00';
  success(state().reset());
  assert.equal(companion.treatsAvailable(data()), 5);
  success(state().feedBlobby('apple'));
  assert.equal(companion.treatsAvailable(data()), 4);
  assert.equal(data().care.xp, 10);
  assert.equal(state().currentAnimation, 'feeding');
  assert.equal(state().feedBlobby('apple').ok, false);
  clock = '2026-09-05T09:00:08+01:00';
  state().react('idle');
  success(state().feedBlobby('berries'));
  assert.equal(companion.treatsAvailable(data()), 3);
  clock = '2026-09-05T09:00:16+01:00';
  state().react('idle');
  assert.equal(state().feedBlobby('berries').ok, false);
  assert.equal(data().care.xp, 30);
  assert.deepEqual(storage.parseBackup(storage.backupText(data())), data());
  state().sync();
  assert.equal(companion.treatsAvailable(data()), 3);
});
test('Free care earns leaves and friendship once a day without repeated-tap farming', () => {
  success(state().careForBlobby('pet'));
  success(state().careForBlobby('pet'));
  assert.equal(data().care.xp, 35);
  assert.equal(data().market.coins, 125);
  success(state().careForBlobby('play'));
  success(state().careForBlobby('play'));
  assert.equal(data().care.xp, 40);
  assert.equal(data().market.coins, 130);
  assert.equal(companion.treatsAvailable(data()), 3);
  clock = '2026-09-06T09:00:00+01:00';
  assert.equal(companion.treatsAvailable(data()), 4);
  success(state().careForBlobby('pet'));
  assert.equal(data().care.xp, 45);
});
test('Check-ins earn ten leaves once per dose, including skips, without changing food allowance', () => {
  success(state().saveMedication({ ...input, startDate: '2026-09-06' }));
  const [a, b] = s.dosesForDay(data(), '2026-09-06');
  const wallet = structuredClone(data().market),
    food = companion.treatsAvailable(data());
  success(state().recordDose(a.id, 'skipped'));
  success(state().recordDose(a.id, 'skipped'));
  success(state().recordDose(b.id, 'taken'));
  success(state().undoDose(a.id));
  success(state().recordDose(a.id, 'skipped'));
  assert.equal(companion.treatsAvailable(data()), food);
  assert.deepEqual(data().market, {
    ...wallet,
    coins: wallet.coins + 20,
    checkInRewards: { ...wallet.checkInRewards, [a.id]: 10, [b.id]: 10 },
  });
});
test('Shop migration keeps original outfits and old records, and validates inventories', () => {
  const legacy = storage.emptyData();
  delete legacy.market;
  legacy.outfit = 'raincoat';
  const migrated = storage.parseData(legacy);
  assert.equal(migrated.outfit, 'raincoat');
  assert.equal(migrated.market.coins, 120);
  assert.deepEqual(migrated.market.ownedOutfits, ['base', 'glasses', 'sweater', 'raincoat']);
  assert.deepEqual(migrated.records, legacy.records);
  for (const bad of [-1, 1.5, 10000, Infinity]) {
    const invalid = structuredClone(migrated);
    invalid.market.foods.cookie = bad;
    assert.throws(() => storage.parseData(invalid));
  }
  const duplicate = structuredClone(migrated);
  duplicate.market.ownedOutfits.push('base');
  assert.throws(() => storage.parseData(duplicate));
});
test('Shop purchase is atomic and idempotent; owned and unaffordable items cannot be charged', () => {
  success(state().reset());
  success(state().claimShopGift());
  assert.equal(data().market.coins, 145);
  assert.equal(state().claimShopGift().ok, false);
  success(state().buyProduct('outfit.frog', 'test-frog'));
  assert.equal(data().market.coins, 65);
  assert.ok(data().market.ownedOutfits.includes('frog'));
  const before = JSON.stringify(data());
  success(state().buyProduct('outfit.frog', 'test-frog'));
  assert.equal(JSON.stringify(data()), before);
  assert.equal(state().buyProduct('outfit.frog', 'duplicate').ok, false);
  assert.equal(state().buyProduct('outfit.starlight', 'expensive').ok, false);
  assert.equal(state().buyProduct('food.cookie', 'test-frog').ok, false);
  assert.equal(state().buyProduct('invalid', 'unknown').ok, false);
  assert.equal(JSON.stringify(data()), before);
  assert.equal(state().setOutfit('starlight').ok, false);
  success(state().setOutfit('frog'));
  success(state().buyProduct('food.cookie', 'cookies'));
  assert.equal(data().market.foods.cookie, 3);
  assert.equal(data().market.coins, 44);
  assert.deepEqual(storage.parseBackup(storage.backupText(data())), data());
});
test('Purchased food survives the next day while the free apple allowance refreshes', () => {
  state().react('idle');
  success(state().feedBlobby('cookie'));
  assert.equal(data().market.foods.cookie, 2);
  clock = '2026-09-07T09:00:00+01:00';
  state().react('idle');
  success(state().claimShopGift());
  assert.equal(data().market.coins, 69);
  assert.equal(data().market.foods.cookie, 2);
  success(state().feedBlobby('apple'));
  assert.equal(data().care.days['2026-09-07'].spent, 1);
  clock = '2026-09-06T09:00:00+01:00';
  assert.equal(state().claimShopGift().ok, false);
});
test('Mood follows overdue unrecorded schedules with a grace period and a fresh start on return', () => {
  clock = '2026-09-05T09:00:00+01:00';
  success(state().reset());
  assert.equal(companion.companionMood(data()), 'idle');
  success(state().saveMedication(input));
  assert.equal(companion.companionMood(data()), 'idle');
  clock = '2026-09-05T10:01:00+01:00';
  assert.equal(companion.companionMood(data()), 'worried');
  clock = '2026-09-06T08:01:00+01:00';
  assert.equal(companion.companionMood(data()), 'sick');
  clock = '2026-09-08T08:01:00+01:00';
  assert.equal(companion.companionMood(data()), 'critical');
  const dose = s.dosesForDay(data(), s.dateKey())[0];
  success(state().recordDose(dose.id, 'skipped'));
  assert.equal(state().currentAnimation, 'celebrating');
  assert.equal(companion.companionMood(data()), 'idle');
  clock = '2026-09-09T09:00:00+01:00';
  success(state().setMedicationStatus(data().medications[0].id, 'paused'));
  assert.equal(companion.companionMood(data()), 'idle');
});
test('Care backups reject malformed ledgers and unsupported snacks', () => {
  for (const value of [
    { xp: -1, days: {} },
    { xp: 1, days: { bad: {} } },
    { xp: 1, days: {}, lastFood: 'unknown' },
  ]) {
    const invalid = structuredClone(data());
    invalid.care = value;
    assert.throws(() => storage.parseData(invalid));
  }
});
test('Room routes stay on the floor, avoid the table and arrive at each interaction', () => {
  for (const activity of ['tea', 'tend', 'window', 'ball', 'walk_to_cushion']) {
    const journey = new choreography.RoomJourney();
    journey.setActivity(activity);
    let arrived = false,
      moved = false;
    let previous = [...journey.position];
    for (let i = 0; i < 900; i++) {
      journey.update(0.05);
      const [x, y, z] = journey.position;
      assert.ok(
        x >= -1.25 && x <= 1.9 && z >= -0.95 && z <= 1.5 && y >= 0 && y < 0.6,
        activity + ' stays inside room',
      );
      assert.ok(!(x > -1.7 && x < -0.5 && z > 0.02 && z < 0.98), activity + ' avoids tea table');
      const distance = Math.hypot(...journey.position.map((v, k) => v - previous[k]));
      assert.ok(distance < 0.24, activity + ' moves continuously');
      moved ||= distance > 0.001;
      arrived ||= journey.phase === 'act' && journey.animation === activity;
      previous = [...journey.position];
    }
    assert.ok(moved);
    if (activity !== 'walk_to_cushion') assert.ok(arrived, activity + ' arrives before acting');
    assert.deepEqual(
      journey.position,
      activity === 'tend' ? choreography.PLACES.garden : choreography.PLACES.cushion,
    );
  }
});
test('Room journeys keep the same active-time route at low frame rates', () => {
  for (const activity of ['tend', 'tea', 'feeding', 'rest']) {
    const reference = new choreography.RoomJourney();
    reference.setActivity(activity);
    for (let i = 0; i < 240; i++) reference.update(1 / 60);
    for (const fps of [1, 2, 15, 60]) {
      const journey = new choreography.RoomJourney();
      journey.setActivity(activity);
      for (let i = 0; i < 4 * fps; i++) journey.update(1 / fps);
      assert.ok(
        Math.abs(journey.elapsed - reference.elapsed) < 1e-8,
        activity + ' active time at ' + fps + ' FPS',
      );
      assert.equal(journey.phase, reference.phase);
      assert.equal(journey.animation, reference.animation);
      journey.position.forEach((value, index) =>
        assert.ok(Math.abs(value - reference.position[index]) < 1e-8),
      );
      const before = JSON.stringify(journey);
      for (const invalid of [0, -1, NaN, Infinity]) journey.update(invalid);
      assert.equal(
        JSON.stringify(journey),
        before,
        'Invalid or paused time cannot advance a journey',
      );
    }
  }
});
test('Gardening stays at the bonsai until the film finishes, then walks home continuously', () => {
  const journey = new choreography.RoomJourney();
  journey.setActivity('tend');
  for (let i = 0; i < 900; i++) journey.update(0.05);
  assert.deepEqual(journey.position, choreography.PLACES.garden);
  journey.setActivity('recovering');
  assert.deepEqual(journey.position, choreography.PLACES.garden);
  for (let i = 0; i < 400; i++) journey.update(0.05);
  assert.deepEqual(journey.position, choreography.PLACES.cushion);
});
test('Bonsai sessions stay open in animated and still rooms until an explicit exit', () => {
  const previousClock = clock;
  state().setPreference('staticScene', false);
  state().react('tend');
  const id = state().reactionId;
  clock = '2026-09-20T12:00:00+01:00';
  state().settle();
  assert.equal(state().currentAnimation, 'tend');
  assert.equal(state().reactionId, id);
  state().react('recovering');
  assert.ok(state().reactionUntil > 0);
  state().setPreference('staticScene', true);
  state().react('tend');
  clock = '2026-09-20T12:01:00+01:00';
  state().settle();
  assert.equal(state().currentAnimation, 'tend');
  assert.equal(state().reactionUntil, -1);
  state().react('recovering');
  clock = '2026-09-20T12:02:00+01:00';
  state().settle();
  assert.equal(state().currentAnimation, 'idle');
  state().setPreference('staticScene', false);
  clock = previousClock;
});
test('Interrupted journeys start at the current position; still poses show the destination', () => {
  const journey = new choreography.RoomJourney();
  journey.setActivity('tend');
  for (let i = 0; i < 40; i++) journey.update(0.05);
  const previous = [...journey.position];
  journey.setActivity('tea');
  assert.deepEqual(journey.position, previous);
  journey.setActivity('window', true);
  assert.deepEqual(journey.position, choreography.PLACES.window);
  assert.equal(journey.phase, 'act');
  assert.equal(journey.animation, 'window');
});
test('Hidden objects disable their activities and mood palettes cover every state', () => {
  assert.equal(choreography.activityAvailable('tea', ['Tea_table']), false);
  assert.equal(choreography.activityAvailable('tend', ['Bonsai']), false);
  assert.equal(choreography.activityAvailable('ball', ['Toy_ball']), false);
  assert.equal(choreography.activityAvailable('window', ['Garden']), false);
  for (const { id } of companion.STATES) assert.ok(choreography.MOOD_LOOKS[id]);
});
test('Camera springs settle without zoom overshoot across frame rates', () => {
  for (const hz of [15, 30, 60, 120]) {
    const spring = new motion.Spring(3.5);
    for (let i = 0; i < hz * 3; i++) {
      spring.step(5.2, 1 / hz, 75, 19);
      assert.ok(spring.value >= 3.5 && spring.value <= 5.201);
    }
    assert.ok(Math.abs(spring.value - 5.2) < 0.001);
  }
});
test('Ball rebounds, loses energy and settles on the floor without numerical drift', () => {
  for (const hz of [15, 30, 60, 120]) {
    const ball = new motion.BouncyBall();
    ball.kick(-1);
    let bounced = false,
      peak = 0;
    for (let i = 0; i < hz * 15; i++) {
      const before = ball.vy;
      ball.step(1 / hz);
      bounced ||= before < 0 && ball.vy > 0;
      peak = Math.max(peak, ball.y);
      assert.ok(ball.y >= 0.145 && ball.x >= 0.18 && ball.x <= 1.58);
      assert.ok(Number.isFinite(ball.spin));
    }
    assert.ok(bounced && peak > 0.35);
    assert.ok(Math.abs(ball.y - 0.145) < 0.002 && Math.abs(ball.vx) < 0.01);
  }
});
test('Tea pickup and placement meet the saucer, with a bounded close-up and a complete journey', () => {
  for (const t of [tea.TEA.gripStart, tea.TEA.gripEnd]) {
    const pose = tea.teaPose(t),
      [x, y, z] = pose.cup,
      [px, py, pz] = tea.TEA.place,
      scale = tea.TEA.characterScale;
    const actual = [
      px + scale * (x * Math.cos(pose.yaw) + z * Math.sin(pose.yaw)),
      py + scale * y,
      pz + scale * (-x * Math.sin(pose.yaw) + z * Math.cos(pose.yaw)),
    ];
    assert.ok(Math.hypot(...actual.map((n, i) => n - tea.TEA.cupHome[i])) < 0.00001);
  }
  for (let t = 0; t < tea.TEA.duration; t += 0.017) {
    const p = tea.teaPose(t);
    assert.ok(p.cup.every(Number.isFinite));
    assert.ok(tea.teaCloseup(t) >= 0 && tea.teaCloseup(t) <= 1);
  }
  assert.equal(tea.teaCloseup(0), 0);
  assert.equal(tea.teaCloseup(tea.TEA.duration), 0);
  const j = new choreography.RoomJourney();
  j.setActivity('tea');
  assert.equal(
    j.segments.find((s) => s.animation === 'tea' && s.phase === 'act').seconds,
    tea.TEA.duration,
  );
  assert.ok(j.duration * 1000 < choreography.activityDuration('tea'));
  for (let n = 0; n < 1000; n++) j.update(0.025);
  assert.deepEqual(j.position, choreography.PLACES.cushion);
});
test('Animated tea owns its completion while static mode retains a timeout', () => {
  state().react('tea');
  assert.equal(state().reactionUntil, -1);
  state().settle();
  assert.equal(state().currentAnimation, 'tea');
  state().react('idle');
  state().setPreference('staticScene', true);
  state().react('tea');
  assert.ok(state().reactionUntil > Date.now());
  state().setPreference('staticScene', false);
  state().react('idle');
});
test('Sensory bonsai has no progress without input and never changes its original leaf layout', () => {
  const g = new garden.SensoryGarden();
  const layout = g.leaves.map(({ x, y, size }) => [x, y, size]);
  for (let i = 0; i < 1000; i++) g.step(0.04);
  assert.equal(g.moisture, 0);
  assert.equal(g.drops.length, 0);
  assert.equal(g.resting, true);
  assert.deepEqual(
    g.leaves.map(({ x, y, size }) => [x, y, size]),
    layout,
  );
});
test('Rain wets nearby leaves while distant leaves remain dry, and release drains all particles', () => {
  const g = new garden.SensoryGarden();
  g.begin({ x: 434, y: 137 });
  for (let i = 0; i < 90; i++) g.step(1 / 60);
  assert.ok(g.moisture > 0);
  assert.ok(g.leaves.some((l) => l.wet > 0.5));
  assert.ok(g.leaves.some((l) => l.wet === 0));
  assert.ok(g.drops.length <= garden.MAX_GARDEN_DROPS);
  g.end();
  for (let i = 0; i < 500; i++) g.step(1 / 60);
  assert.equal(g.drops.length, 0);
  assert.equal(g.ripples.length, 0);
  assert.equal(g.resting, true);
});
test('Breeze removes local water and blows real beads in the brushing direction', () => {
  for (const direction of [-1, 1]) {
    const g = new garden.SensoryGarden();
    g.leaves.forEach((leaf) => {
      leaf.wet = 1;
    });
    g.tool = 'breeze';
    g.move({ x: 434 - direction * 80, y: 137 });
    g.begin({ x: 434, y: 137 });
    let detached;
    for (let i = 0; i < 120 && !detached; i++) {
      g.step(1 / 60);
      detached = g.drops.find((drop) => drop.kind === 'blown');
    }
    assert.ok(detached, 'Wet leaves should shed an actual particle');
    assert.equal(Math.sign(detached.vx), direction);
    const nearbyOrigin = g.leaves.some((leaf) => {
      const p = g.leafPosition(leaf);
      return Math.hypot(p.x - detached.x, p.y - detached.y) < 12;
    });
    assert.ok(nearbyOrigin, 'A bead must start at its leaf, not at the tool');
    for (let i = 0; i < 180; i++) g.step(1 / 60);
    assert.ok(
      g.leaves
        .filter((leaf) => Math.hypot(leaf.x - 434, leaf.y - 137) < 65)
        .every((leaf) => leaf.wet < 0.08),
    );
    assert.ok(
      g.leaves
        .filter((leaf) => Math.hypot(leaf.x - 434, leaf.y - 137) > 200)
        .every((leaf) => leaf.wet > 0.9),
    );
    g.end();
    for (let i = 0; i < 600; i++) g.step(1 / 60);
    assert.equal(g.drops.length + g.ripples.length, 0);
    assert.equal(g.resting, true);
  }
});
test('Reduced-motion breeze clears wet leaves without ejecting animated water', () => {
  const g = new garden.SensoryGarden();
  g.leaves.forEach((leaf) => {
    leaf.wet = 1;
  });
  g.reduced = true;
  g.tool = 'breeze';
  g.begin({ x: 434, y: 137 });
  for (let i = 0; i < 120; i++) g.step(1 / 60);
  assert.ok(g.leaves.some((leaf) => leaf.wet === 0));
  assert.ok(g.leaves.some((leaf) => leaf.wet > 0.9));
  assert.equal(g.drops.length + g.ripples.length, 0);
  assert.ok(g.crowns.every((c) => c.sway === 0));
});
test('Falling water lands on the soil before it can pass through the planter', () => {
  const g = new garden.SensoryGarden();
  g.drops.push({ x: 462, y: 430, vx: 0, vy: 100, life: 1.8, size: 2, kind: 'rain' });
  for (let i = 0; i < 10; i++) g.step(1 / 60);
  assert.ok(g.ripples.some((ripple) => ripple.y >= 437 && ripple.y < 450));
  assert.ok(g.drops.some((drop) => drop.kind === 'splash'));
  assert.ok(!g.drops.some((drop) => drop.kind === 'rain'));
  assert.ok(g.soil > 0);
});
test('Fuller rain stays within its particle budget through repeated watering and blowing', () => {
  const g = new garden.SensoryGarden();
  g.begin({ x: 434, y: 137 });
  for (let i = 0; i < 45; i++) g.step(1 / 60);
  assert.ok(g.drops.filter((d) => d.kind === 'rain').length >= 65);
  assert.ok(g.drops.every((d) => d.size >= 1.7));
  for (let i = 0; i < 1600; i++) {
    g.tool = Math.floor(i / 120) % 2 ? 'breeze' : 'rain';
    g.step(0.04);
    assert.ok(g.drops.length <= garden.MAX_GARDEN_DROPS);
    assert.ok(g.ripples.length <= 36);
  }
  g.end();
  for (let i = 0; i < 500; i++) g.step(0.04);
  assert.equal(g.resting, true);
});
test('Breeze springs settle gently without adding water; input spikes remain bounded', () => {
  const g = new garden.SensoryGarden();
  g.tool = 'breeze';
  g.begin({ x: 434, y: 137 });
  for (let i = 0; i < 100; i++) g.step(100);
  assert.equal(g.moisture, 0);
  assert.ok(g.leaves.some((l) => Math.abs(l.bend) > 0.01));
  assert.ok(g.leaves.every((l) => Math.abs(l.bend) <= 0.48));
  g.end();
  for (let i = 0; i < 1000; i++) g.step(0.02);
  assert.equal(g.resting, true);
});
test('A steady breeze keeps the connected canopy swaying, and follows brushing direction', () => {
  const g = new garden.SensoryGarden();
  g.tool = 'breeze';
  g.begin({ x: 434, y: 137 });
  for (let i = 0; i < 60; i++) g.step(1 / 60);
  const first = g.crowns[4].sway;
  assert.ok(first > 0.3, 'The canopy must move enough to read at phone size');
  const sway = [];
  for (let i = 0; i < 180; i++) {
    g.step(1 / 60);
    sway.push(g.crowns[4].sway);
  }
  assert.ok(
    Math.max(...sway) - Math.min(...sway) > 0.3,
    'A held breeze must sway, not just tilt once',
  );
  g.move({ x: 400, y: 137 });
  for (let i = 0; i < 90; i++) g.step(1 / 60);
  assert.ok(g.crowns[4].sway < -0.1, 'Brushing left bends the crown left');
  assert.ok(g.crowns.every((c) => Math.abs(c.sway) <= 1.2));
  g.end();
  for (let i = 0; i < 600; i++) g.step(1 / 60);
  assert.equal(g.resting, true);
});
test('Reduced-motion breeze gives leaf feedback without animated foliage', () => {
  const g = new garden.SensoryGarden();
  g.tool = 'breeze';
  g.begin({ x: 434, y: 137 });
  for (let i = 0; i < 90; i++) g.step(1 / 60);
  g.reduced = true;
  assert.ok(g.crowns.every((c) => c.sway === 0 && c.velocity === 0));
  g.clearDroplets();
  g.begin({ x: 434, y: 137 });
  for (let i = 0; i < 90; i++) g.step(1 / 60);
  assert.ok(g.leaves.some((l) => l.brushed > 0.7));
  assert.ok(g.leaves.some((l) => l.brushed === 0));
  assert.ok(g.leaves.every((l) => l.bend === 0 && l.velocity === 0));
  assert.equal(g.moisture, 0);
  g.end();
  assert.equal(g.resting, true);
});
test('Reduced motion allows water-bead feedback with no moving leaves or droplets', () => {
  const g = new garden.SensoryGarden();
  g.reduced = true;
  g.begin({ x: 434, y: 137 });
  for (let i = 0; i < 100; i++) g.step(0.02);
  assert.ok(g.moisture > 0);
  assert.equal(g.drops.length, 0);
  assert.ok(g.leaves.every((l) => l.bend === 0));
  g.clearDroplets();
  assert.equal(g.moisture, 0);
  assert.equal(g.active, false);
});
test('Switching to reduced motion immediately removes moving water and settles leaves', () => {
  const g = new garden.SensoryGarden();
  g.begin({ x: 434, y: 137 });
  for (let i = 0; i < 100; i++) g.step(0.02);
  assert.ok(g.drops.length > 0);
  const moisture = g.moisture;
  g.reduced = true;
  assert.equal(g.drops.length + g.ripples.length, 0);
  assert.ok(g.leaves.every((l) => l.bend === 0 && l.velocity === 0));
  assert.equal(g.moisture, moisture);
  g.end();
  assert.equal(g.resting, true);
});
function reminderFixture() {
  return {
    ...storage.emptyData(),
    medications: [
      {
        id: 'reminder-med',
        name: 'Private medicine',
        dosage: '1 tablet · 10 mg per tablet',
        strengthMg: 10,
        tabletsPerDose: 1,
        instructions: '',
        color: '#738962',
        createdAt: '2026-09-05T07:00:00Z',
        archived: false,
        stock: null,
        refillAt: 5,
        schedules: [
          {
            from: '2026-09-05',
            times: ['08:00', '20:00'],
            days: [0, 1, 2, 3, 4, 5, 6],
            active: true,
          },
        ],
      },
    ],
  };
}
test('Reminder delivery includes only due, unrecorded, unsent doses and respects snooze', () => {
  const f = reminderFixture(),
    now = new Date('2026-09-05T09:00:00+01:00');
  const id = s.dosesForDay(f, '2026-09-05')[0].id;
  assert.deepEqual(
    reminders.dueReminders(f, now).map((d) => d.id),
    [id],
  );
  f.reminders[id] = { snoozedUntil: '2026-09-05T09:10:00+01:00' };
  assert.equal(reminders.dueReminders(f, now).length, 0);
  assert.equal(+reminders.nextReminderTime(f, now), +new Date('2026-09-05T09:10:00+01:00'));
  f.reminders[id] = { notifiedAt: now.toISOString() };
  assert.equal(reminders.dueReminders(f, now).length, 0);
  assert.equal(+reminders.nextReminderTime(f, now), +new Date('2026-09-05T20:00:00+01:00'));
  f.reminders = {};
  f.records[id] = {
    ...s.findDose(f, id),
    status: 'skipped',
    recordedAt: now.toISOString(),
    note: '',
  };
  assert.equal(reminders.dueReminders(f, now).length, 0);
});
test('A future dose is never notified early even if its snooze expires', () => {
  const f = reminderFixture(),
    now = new Date('2026-09-05T07:30:00+01:00');
  const id = s.dosesForDay(f, '2026-09-05')[0].id;
  f.reminders[id] = { snoozedUntil: '2026-09-05T07:15:00+01:00' };
  assert.equal(reminders.dueReminders(f, now).length, 0);
  assert.equal(+reminders.nextReminderTime(f, now), +new Date('2026-09-05T08:00:00+01:00'));
});
test('An explicit snooze survives midnight without catching up old unsnoozed doses', () => {
  const f = reminderFixture(),
    id = s.dosesForDay(f, '2026-09-05')[1].id;
  f.reminders[id] = { snoozedUntil: '2026-09-06T00:10:00+01:00' };
  assert.equal(reminders.dueReminders(f, new Date('2026-09-06T00:05:00+01:00')).length, 0);
  assert.deepEqual(
    reminders.dueReminders(f, new Date('2026-09-06T00:11:00+01:00')).map((d) => d.id),
    [id],
  );
  assert.equal(reminders.dueReminders(f, new Date('2026-09-07T00:11:00+01:00')).length, 0);
});
test('Paused and archived schedules have no reminder candidates', () => {
  const f = reminderFixture(),
    now = new Date('2026-09-05T09:00:00+01:00');
  f.medications[0].schedules[0].active = false;
  assert.equal(reminders.dueReminders(f, now).length, 0);
  assert.equal(reminders.nextReminderTime(f, now), undefined);
  f.medications[0].schedules[0].active = true;
  f.medications[0].archived = true;
  assert.equal(reminders.dueReminders(f, now).length, 0);
});
test('Delivery acknowledgement cannot overwrite a newer snooze or a completed check-in', () => {
  clock = '2026-09-05T09:00:00+01:00';
  success(state().restore(reminderFixture()));
  const id = s.dosesForDay(data(), '2026-09-05')[0].id;
  const delivery = reminders.dueReminders(data());
  success(state().snoozeDose(id, 10));
  success(state().markNotified(delivery));
  assert.equal(data().reminders[id].notifiedAt, undefined);
  const snooze = data().reminders[id].snoozedUntil;
  success(state().recordDose(id, 'taken'));
  success(state().markNotified([{ id, snoozedUntil: snooze }]));
  assert.equal(data().reminders[id], undefined);
});
test('Blobby’s prompt selects a due dose, never a future, recorded or paused dose', () => {
  const f = reminderFixture(),
    now = new Date('2026-09-05T12:00:00+01:00');
  const first = s.dosesForDay(f, '2026-09-05')[0];
  assert.equal(companion.companionCheckIn(f, now).id, first.id);
  assert.equal(companion.companionCheckIn(f, new Date('2026-09-05T07:59:00+01:00')), undefined);
  f.records[first.id] = { ...first, status: 'taken', recordedAt: now.toISOString(), note: '' };
  assert.equal(companion.companionCheckIn(f, now), undefined);
  f.records = {};
  f.medications[0].schedules[0].active = false;
  assert.equal(companion.companionCheckIn(f, now), undefined);
  f.medications[0].schedules[0].active = true;
  f.medications[0].archived = true;
  assert.equal(companion.companionCheckIn(f, now), undefined);
});
test('Blobby’s prompt prefers another due dose over a snooze and advances after a check-in', () => {
  const f = reminderFixture(),
    now = new Date('2026-09-05T21:00:00+01:00');
  const [first, second] = s.dosesForDay(f, '2026-09-05');
  f.reminders[first.id] = { snoozedUntil: '2026-09-05T21:10:00+01:00' };
  assert.equal(companion.companionCheckIn(f, now).id, second.id);
  f.records[second.id] = { ...second, status: 'skipped', recordedAt: now.toISOString(), note: '' };
  assert.equal(companion.companionCheckIn(f, now).id, first.id);
});
test('Historical sadness points to the missing record and clears after a return', () => {
  const f = reminderFixture(),
    now = new Date('2026-09-06T07:00:00+01:00');
  assert.equal(companion.companionMood(f, now), 'worried');
  assert.equal(companion.companionCheckIn(f, now).date, '2026-09-05');
  const first = s.dosesForDay(f, '2026-09-05')[0];
  f.records[first.id] = { ...first, status: 'skipped', recordedAt: now.toISOString(), note: '' };
  assert.equal(companion.companionMood(f, now), 'idle');
  assert.equal(companion.companionCheckIn(f, now), undefined);
});
test('Local daylight changes smoothly and stays dark across midnight', () => {
  const env = (h, m = 0) => environment.roomEnvironment(new Date(2026, 8, 5, h, m));
  assert.equal(env(12).daylight, 1);
  assert.equal(env(23).daylight, 0);
  assert.equal(env(23).sky, env(0).sky);
  assert.ok(env(7).daylight > env(6).daylight);
  assert.ok(env(20).daylight < env(18).daylight);
  assert.ok(Math.abs(env(8, 59).daylight - env(9).daylight) < 0.01);
});
test('Old backups default the lamp on and explicit choices survive restore', () => {
  const old = storage.emptyData();
  delete old.preferences.lampOn;
  assert.equal(storage.parseData(old).preferences.lampOn, true);
  old.preferences.lampOn = false;
  assert.equal(storage.parseData(old).preferences.lampOn, false);
  old.preferences.lampOn = 'off';
  assert.throws(() => storage.parseData(old));
});
test('Blobby walks to the bed, stays asleep, then stands before walking away', () => {
  const j = new choreography.RoomJourney();
  j.setActivity('rest');
  assert.equal(j.phase, 'travel');
  for (let i = 0; i < 2400; i++) j.update(0.05);
  assert.deepEqual(j.position, choreography.PLACES.bed);
  assert.equal(j.animation, 'rest');
  j.setActivity('tea');
  assert.equal(j.animation, 'stretch');
  assert.deepEqual(j.position, choreography.PLACES.bed);
  for (let i = 0; i < 10; i++) j.update(0.05);
  assert.deepEqual(j.position, choreography.PLACES.bed);
  for (let i = 0; i < 400; i++) j.update(0.05);
  assert.deepEqual(j.position, choreography.PLACES.cushion);
  assert.equal(choreography.activityAvailable('rest', ['Bed']), false);
});
test('Sleep is explicitly interruptible and does not change medication data', () => {
  const before = structuredClone(data());
  state().react('rest');
  assert.equal(state().reactionUntil, -1);
  state().settle();
  assert.equal(state().currentAnimation, 'rest');
  state().react('idle');
  assert.equal(state().currentAnimation, 'idle');
  assert.deepEqual(data(), before);
});
test('Accessibility preferences migrate, round-trip and reject invalid values', () => {
  const old = storage.emptyData();
  for (const key of ['pauseScene', 'gentleMoods', 'hideRewards', 'relaxedGarden', 'showWisdom'])
    delete old.preferences[key];
  const migrated = storage.parseData(old);
  assert.equal(migrated.preferences.relaxedGarden, true);
  assert.equal(migrated.preferences.gentleMoods, false);
  assert.equal(migrated.preferences.showWisdom, true);
  for (const key of ['pauseScene', 'gentleMoods', 'hideRewards', 'relaxedGarden', 'showWisdom']) {
    const valid = structuredClone(migrated);
    valid.preferences[key] = true;
    assert.equal(storage.parseBackup(storage.backupText(valid)).preferences[key], true);
    valid.preferences[key] = false;
    assert.equal(storage.parseBackup(storage.backupText(valid)).preferences[key], false);
    valid.preferences[key] = 'true';
    assert.throws(() => storage.parseData(valid));
  }
});
test('Calm settings apply atomically without changing medication or care records', () => {
  const before = structuredClone(data());
  success(state().setCalmMode());
  assert.deepEqual(data().medications, before.medications);
  assert.deepEqual(data().records, before.records);
  assert.deepEqual(data().care, before.care);
  assert.ok(
    data().preferences.reducedMotion &&
      data().preferences.hideRewards &&
      data().preferences.gentleMoods &&
      data().preferences.pauseScene &&
      data().preferences.relaxedGarden &&
      !data().preferences.showWisdom,
  );
});
function celebrationFixture() {
  clock = '2026-09-05T12:00:00+01:00';
  success(state().reset());
  success(state().saveMedication(input));
  return s.dosesForDay(data(), s.dateKey());
}
test('New honest check-ins celebrate with leaves and accurate supply changes', () => {
  const [a, b] = celebrationFixture();
  const market = structuredClone(data().market);
  success(state().recordDose(a.id, 'taken'));
  assert.equal(state().celebration.title, 'Dose recorded!');
  assert.equal(state().celebration.allDone, false);
  assert.equal(state().celebration.doseId, a.id);
  const eventId = state().celebration.id;
  success(state().recordDose(b.id, 'skipped'));
  assert.equal(state().celebration.title, 'All checked in!');
  assert.equal(state().celebration.allDone, true);
  assert.notEqual(state().celebration.id, eventId);
  assert.deepEqual(data().market, {
    ...market,
    coins: market.coins + 20,
    checkInRewards: { [a.id]: 10, [b.id]: 10 },
  });
  assert.equal(state().celebration.leaves, 10);
  assert.equal(s.remainingStock(data(), data().medications[0]), 29);
  assert.equal(JSON.parse(memory.get(storage.STORAGE_KEY)).celebration, undefined);
});
test('Duplicate saves, note edits and status corrections do not replay the celebration', () => {
  const [a] = celebrationFixture();
  success(state().recordDose(a.id, 'skipped'));
  assert.equal(state().celebration.title, 'Check-in saved!');
  const eventId = state().celebration.id,
    reaction = state().reactionId;
  success(state().recordDose(a.id, 'skipped'));
  assert.equal(state().celebration.id, eventId);
  state().dismissCelebration(eventId);
  success(state().recordDose(a.id, 'skipped', 'Added a note'));
  success(state().recordDose(a.id, 'taken', 'Corrected my record'));
  assert.equal(state().celebration, null);
  assert.equal(state().reactionId, reaction);
  assert.equal(Object.keys(data().records).length, 1);
});
test('Undo cancels its celebration and restores supply; old timers cannot dismiss a later check-in', () => {
  const [a, b] = celebrationFixture();
  success(state().recordDose(a.id, 'taken'));
  const firstId = state().celebration.id;
  success(state().recordDose(b.id, 'taken'));
  const secondId = state().celebration.id;
  state().dismissCelebration(firstId);
  assert.equal(state().celebration.id, secondId);
  success(state().undoDose(b.id));
  assert.equal(state().celebration, null);
  assert.equal(s.remainingStock(data(), data().medications[0]), 29);
});
test('A check-in already written by another tab does not trigger a local celebration', () => {
  const [a] = celebrationFixture();
  const saved = structuredClone(data());
  saved.records[a.id] = { ...a, status: 'taken', note: '', recordedAt: new Date().toISOString() };
  memory.set(storage.STORAGE_KEY, JSON.stringify(saved));
  assert.equal(Object.keys(data().records).length, 0, 'This tab still has the older data');
  success(state().recordDose(a.id, 'taken'));
  assert.equal(state().celebration, null);
  assert.equal(Object.keys(data().records).length, 1);
  state().sync();
  assert.equal(state().celebration, null);
});
test('Failed writes and future-day records never create a success celebration', () => {
  const [a] = celebrationFixture();
  const write = localStorage.setItem;
  localStorage.setItem = () => {
    throw new Error('Simulated full storage');
  };
  try {
    assert.equal(state().recordDose(a.id, 'taken').ok, false);
  } finally {
    localStorage.setItem = write;
  }
  assert.equal(state().celebration, null);
  assert.equal(Object.keys(data().records).length, 0);
  const tomorrow = s.dosesForDay(data(), '2026-09-06')[0];
  assert.equal(state().recordDose(tomorrow.id, 'taken').ok, false);
  assert.equal(state().celebration, null);
});
test('Celebration preview does not change medication, supply, rewards or saved data', () => {
  celebrationFixture();
  const before = structuredClone(data()),
    raw = memory.get(storage.STORAGE_KEY);
  state().previewCelebration();
  assert.equal(state().celebration.doseId, null);
  assert.equal(state().celebration.title, 'Celebration preview');
  assert.equal(state().toast.undoId, undefined);
  assert.equal(state().toast.message, 'Celebration preview. No dose was recorded.');
  assert.deepEqual(data(), before);
  assert.equal(memory.get(storage.STORAGE_KEY), raw);
});
test('Historical check-ins do not claim that today is complete', () => {
  const [a] = celebrationFixture();
  clock = '2026-09-06T12:00:00+01:00';
  success(state().recordDose(a.id, 'taken'));
  assert.equal(state().celebration.allDone, false);
  assert.equal(state().celebration.title, 'Dose recorded!');
});
test('Old saves migrate to the four original room items without changing dose records', () => {
  const [dose] = celebrationFixture();
  success(state().recordDose(dose.id, 'taken'));
  const old = structuredClone(data());
  delete old.room;
  delete old.market.ownedRoomItems;
  const parsed = storage.parseData(old);
  assert.deepEqual(parsed.room, roomCollection.DEFAULT_ROOM);
  assert.deepEqual(parsed.market.ownedRoomItems, Object.values(roomCollection.DEFAULT_ROOM));
  assert.deepEqual(parsed.records, old.records);
  assert.deepEqual(parsed.medications, old.medications);
});
test('Room purchases are idempotent, owned items equip without repurchasing, and locked items cannot equip', () => {
  celebrationFixture();
  const before = structuredClone(data());
  assert.equal(state().equipRoomItem('lava_lamp').ok, false);
  assert.deepEqual(data(), before);
  success(state().buyProduct('room.lava_lamp', 'room-order-1'));
  success(state().buyProduct('room.lava_lamp', 'room-order-1'));
  assert.equal(data().market.coins, 75);
  assert.equal(data().room.lamp, 'paper_lamp', 'Buying does not apply a preview');
  assert.equal(data().market.ownedRoomItems.filter((id) => id === 'lava_lamp').length, 1);
  assert.equal(state().buyProduct('room.lava_lamp', 'room-order-2').ok, false);
  success(state().equipRoomItem('lava_lamp'));
  assert.equal(data().room.lamp, 'lava_lamp');
  success(state().equipRoomItem('paper_lamp'));
  assert.equal(data().room.lamp, 'paper_lamp');
  assert.equal(data().market.coins, 75);
  assert.deepEqual(data().records, before.records);
  assert.deepEqual(data().medications, before.medications);
  assert.deepEqual(data().care, before.care);
});
test('Equipping a room piece reveals its own area and preserves unrelated visibility choices', () => {
  celebrationFixture();
  success(state().toggleRoomItem('Lamp'));
  success(state().toggleRoomItem('Bonsai'));
  success(state().buyProduct('room.lava_lamp', 'visible-lamp'));
  success(state().equipRoomItem('lava_lamp'));
  assert.equal(data().hiddenGroups.includes('Lamp'), false);
  assert.equal(data().hiddenGroups.includes('Bonsai'), true);
});
test('Room backups reject cross-slot, unknown, unowned and duplicate selections without overwriting data', () => {
  celebrationFixture();
  const raw = memory.get(storage.STORAGE_KEY);
  for (const corrupt of ['slot', 'unknown', 'unowned', 'duplicate']) {
    const d = structuredClone(data());
    if (corrupt === 'slot') d.room.garden = 'tea_set';
    if (corrupt === 'unknown') d.room.view = 'unknown_view';
    if (corrupt === 'unowned') d.room.lamp = 'lava_lamp';
    if (corrupt === 'duplicate') d.market.ownedRoomItems.push('paper_lamp');
    assert.equal(state().restore(d).ok, false, corrupt);
    assert.equal(memory.get(storage.STORAGE_KEY), raw);
  }
});
test('Room ownership and selected pieces round-trip through backup and cross-tab sync', () => {
  celebrationFixture();
  success(state().buyProduct('room.coast_view', 'coast-purchase'));
  success(state().equipRoomItem('coast_view'));
  const copy = storage.parseBackup(storage.backupText(data()));
  assert.deepEqual(copy.room, data().room);
  assert.deepEqual(copy.market, data().market);
  const fresh = structuredClone(data());
  fresh.market.ownedRoomItems.push('mushroom_lamp');
  memory.set(storage.STORAGE_KEY, JSON.stringify(fresh));
  success(state().equipRoomItem('mushroom_lamp'));
  assert.equal(data().room.lamp, 'mushroom_lamp');
  assert.equal(data().room.view, 'coast_view');
});
test('Room swaps hide the replaced assemblies and preserve unrelated room objects', () => {
  const hidden = roomCollection.roomHiddenGroups(
    { garden: 'sand_garden', table: 'record_player', lamp: 'lava_lamp', view: 'coast_view' },
    ['Bed'],
  );
  for (const group of ['Bonsai', 'Tea_table', 'Books', 'Lamp', 'Garden', 'Bed'])
    assert.ok(hidden.includes(group));
  assert.equal(hidden.includes('Cushion'), false);
  assert.deepEqual(roomCollection.roomHiddenGroups(roomCollection.DEFAULT_ROOM, []), []);
});
test('Installed games use untimed activity locks, including in still-image mode', () => {
  celebrationFixture();
  success(state().buyProduct('room.sand_garden', 'zen-purchase'));
  success(state().equipRoomItem('sand_garden'));
  success(state().setPreference('staticScene', true));
  state().react('tend');
  assert.equal(state().reactionUntil, -1);
  assert.equal(roomCollection.roomGameFor('tend', data().room), 'sand');
  assert.equal(roomCollection.roomGameFor('tea', data().room), null);
  success(state().equipRoomItem('bonsai'));
  assert.equal(state().reactionUntil, 0);
  assert.equal(state().currentAnimation, 'idle');
});
test('Buy and use purchases and places one room piece atomically', () => {
  celebrationFixture();
  success(state().toggleRoomItem('Lamp'));
  success(state().toggleRoomItem('Bonsai'));
  const before = structuredClone(data());
  success(state().buyRoomProduct('room.lava_lamp', 'place-lava'));
  assert.equal(data().room.lamp, 'lava_lamp');
  assert.equal(data().market.coins, before.market.coins - 45);
  assert.ok(data().market.ownedRoomItems.includes('lava_lamp'));
  assert.deepEqual(data().hiddenGroups, ['Bonsai']);
  assert.deepEqual(data().records, before.records);
  assert.deepEqual(data().medications, before.medications);
  success(state().equipRoomItem('paper_lamp'));
  success(state().buyRoomProduct('room.lava_lamp', 'place-lava'));
  assert.equal(
    data().room.lamp,
    'paper_lamp',
    'A repeated purchase callback does not overwrite a later choice',
  );
  assert.equal(data().market.coins, before.market.coins - 45);
});
test('Buy and use never charges or equips when storage fails', () => {
  celebrationFixture();
  const before = structuredClone(data()),
    write = localStorage.setItem,
    raw = memory.get(storage.STORAGE_KEY);
  localStorage.setItem = () => {
    throw new Error('Disk full');
  };
  try {
    assert.equal(state().buyRoomProduct('room.lava_lamp', 'failed-place').ok, false);
  } finally {
    localStorage.setItem = write;
  }
  assert.deepEqual(data(), before);
  assert.equal(memory.get(storage.STORAGE_KEY), raw);
});
test('Buy and use rejects non-room products and insufficient funds without mutation', () => {
  celebrationFixture();
  const before = structuredClone(data());
  assert.equal(state().buyRoomProduct('food.cookie', 'bad-room-buy').ok, false);
  assert.deepEqual(data(), before);
  success(state().buyRoomProduct('room.record_player', 'vinyl-use'));
  const after = structuredClone(data());
  assert.equal(state().buyRoomProduct('room.sand_garden', 'too-costly').ok, false);
  assert.deepEqual(data(), after);
});
test('The sand rake displaces seven grooves and leaves distant sand untouched', () => {
  const field = new SandField(600, 400);
  field.begin();
  for (let x = 80; x <= 520; x += 2) field.stamp(x, 200, 0, 70, 'rake');
  field.end(true);
  for (let tine = -3; tine <= 3; tine++)
    assert.ok(field.heights[(200 + tine * 10) * 600 + 300] < -2);
  assert.equal(field.heights[40 * 600 + 300], 0);
  assert.ok(
    field.heights.some((v) => v > 0.15),
    'Displaced sand forms raised shoulders',
  );
});
test('Smoothing lowers relief and repeated strokes have bounded depth', () => {
  const field = new SandField(300, 240);
  for (let pass = 0; pass < 12; pass++)
    for (let x = 60; x <= 240; x += 2) field.stamp(x, 120, 0, 70, 'rake');
  const before = field.heights.reduce((sum, v) => sum + Math.abs(v), 0);
  assert.ok(field.heights.every((v) => v >= -2.651 && v <= 0.851));
  for (let x = 50; x <= 250; x += 2) field.stamp(x, 120, 0, 96, 'smooth');
  assert.ok(field.heights.reduce((sum, v) => sum + Math.abs(v), 0) < before * 0.2);
});
test('Fresh sand and strokes can be undone within bounded memory', () => {
  const field = new SandField(160, 160);
  for (let i = 0; i < 12; i++) {
    field.begin();
    field.stamp(40 + i * 4, 80, 0, 40, 'rake');
    field.end(true);
  }
  assert.equal(field.history.length, 6);
  const before = field.heights.slice();
  field.clear();
  assert.ok(field.heights.every((v) => v === 0));
  assert.equal(field.undo(), true);
  assert.deepEqual(field.heights, before);
  field.begin();
  field.end(false);
  assert.equal(field.history.length, 5);
});
test('Sand survives a responsive resize without stretching the pattern', () => {
  const field = new SandField(300, 200);
  field.begin();
  for (let x = 80; x < 220; x += 2) field.stamp(x, 100, 0, 60, 'rake');
  field.end(true);
  const resized = field.resized(600, 500);
  assert.ok(Math.abs(resized.heights[250 * 600 + 300] - field.heights[100 * 300 + 150]) < 0.01);
  assert.ok(resized.heights.slice(0, 600 * 40).every((v) => v === 0));
  assert.equal(resized.undo(), true);
  assert.ok(resized.heights.every((v) => v === 0));
});
test('Voice choices migrate and round-trip without changing health data', () => {
  const old = storage.emptyData();
  delete old.voice;
  assert.equal(storage.parseData(old).voice, 'cloud');
  const before = structuredClone(data());
  for (const voice of ['cloud', 'moss', 'pip', 'quiet']) {
    success(state().setVoice(voice));
    assert.equal(storage.parseBackup(storage.backupText(data())).voice, voice);
  }
  for (const value of ['unknown', null, 3, {}]) {
    assert.throws(() => storage.parseData({ ...old, voice: value }));
    assert.equal(state().setVoice(value).ok, false);
  }
  for (const key of ['medications', 'records', 'care', 'market', 'reminders'])
    assert.deepEqual(data()[key], before[key]);
});
test('Little thoughts offer a complete, sourced deck without repeats or a health-data input', () => {
  const day = new RealDate('2026-09-07T14:00:00+01:00');
  const all = wisdom.thoughtsForDay(day, 'all');
  assert.equal(all.length, 35);
  assert.equal(new Set(all.map((t) => t.id)).size, all.length);
  for (const thought of all) {
    assert.ok(thought.text.length > 0 && thought.text.length <= 180);
    if (thought.kind === 'quote') {
      assert.ok(thought.author && thought.work);
      assert.equal(new URL(thought.url).protocol, 'https:');
    }
  }
  const tips = wisdom.thoughtsForDay(day, 'tips');
  const quotes = wisdom.thoughtsForDay(day, 'quotes');
  assert.equal(tips.length, 30);
  assert.equal(quotes.length, 5);
  assert.ok(tips.every((t) => t.kind === 'tip'));
  assert.ok(quotes.every((t) => t.kind === 'quote'));
  for (let i = 0; i < all.length; i++) {
    const week = Array.from({ length: 7 }, (_, k) => all[(i + k) % all.length]);
    assert.equal(week.filter((t) => t.kind === 'quote').length, 1);
  }
});
test('Daily thoughts use the local date and cover the collection, including DST changes', () => {
  const days = Array.from({ length: 35 }, (_, i) => new RealDate(2026, 9, 15 + i, 12));
  const starts = days.map((day) => wisdom.thoughtsForDay(day, 'all')[0].id);
  assert.equal(new Set(starts).size, 35);
  for (const date of ['2026-03-29', '2026-10-25']) {
    const early = new RealDate(date + 'T00:01:00');
    const late = new RealDate(date + 'T23:59:00');
    assert.deepEqual(wisdom.thoughtsForDay(early, 'all'), wisdom.thoughtsForDay(late, 'all'));
  }
});
test('Legacy check-ins cannot gain new leaves through undo, and backups omit paid balances', () => {
  const [dose] = celebrationFixture();
  success(state().recordDose(dose.id, 'taken'));
  const legacy = structuredClone(data());
  delete legacy.market.checkInRewards;
  legacy.market.purchasedLeaves = 90000;
  const migrated = storage.parseData(legacy);
  assert.equal(migrated.market.checkInRewards[dose.id], 0);
  assert.equal(migrated.market.purchasedLeaves, undefined);
  success(state().restore(migrated));
  const coins = data().market.coins;
  success(state().undoDose(dose.id));
  success(state().recordDose(dose.id, 'taken'));
  assert.equal(data().market.coins, coins);
});
test('Paid shop deliveries consume only the earned portion, grant inventory once and survive retries', () => {
  success(state().reset());
  const saved = structuredClone(data());
  saved.market.coins = 6;
  success(state().restore(saved));
  const order = {
    id: 'paid-order-test',
    productId: 'food.cookie',
    paidLeaves: 15,
    earnedLeaves: 6,
  };
  success(state().completePaidOrder(order));
  assert.equal(data().market.coins, 0);
  assert.equal(data().market.foods.cookie, 3);
  const after = structuredClone(data().market);
  success(state().completePaidOrder(order));
  assert.deepEqual(data().market, after);
  assert.equal(state().completePaidOrder({ ...order, paidLeaves: 21 }).ok, false);
});
test('Failed storage cannot award a check-in reward or grant an item bought with paid leaves', () => {
  const [dose] = celebrationFixture();
  const before = structuredClone(data());
  const original = localStorage.setItem;
  localStorage.setItem = () => {
    throw new Error('Full');
  };
  assert.equal(state().recordDose(dose.id, 'taken').ok, false);
  assert.deepEqual(data(), before);
  assert.equal(
    state().completePaidOrder({
      id: 'paid-failed',
      productId: 'food.cookie',
      paidLeaves: 21,
      earnedLeaves: 0,
    }).ok,
    false,
  );
  assert.deepEqual(data(), before);
  localStorage.setItem = original;
  success(state().recordDose(dose.id, 'taken'));
  assert.equal(data().market.coins, before.market.coins + 10);
});
await writeFile(
  path.join(out, 'domain-results.json'),
  JSON.stringify({ status: 'passed', count: cases.length, cases }, null, 2),
);
console.log(
  cases.length +
    ' domain checks passed: schedule, inventory, rollover, persistence, backup and export behavior.',
);
