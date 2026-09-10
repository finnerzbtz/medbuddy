import { build } from 'esbuild';
import assert from 'node:assert/strict';
process.env.TZ = 'Europe/London';
import { mkdir, readFile } from 'node:fs/promises';
await mkdir('rebuild/generated/release-a', { recursive: true });
await build({
  entryPoints: {
    routines: 'src/domain/routines.ts',
    storage: 'src/domain/storage.ts',
    companion: 'src/domain/companion.ts',
    appStore: 'src/stores/appStore.ts',
    nativePlanner: 'src/domain/native-reminders.ts',
    cloudPayload: 'src/cloud/payload.ts',
  },
  outdir: 'rebuild/generated/release-a',
  bundle: true,
  format: 'esm',
  platform: 'node',
  define: { 'import.meta.env.DEV': 'false' },
});
const load = (n) => import(new URL(`../../rebuild/generated/release-a/${n}.js`, import.meta.url));
const memory = new Map();
let failSave = false;
globalThis.localStorage = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => {
    if (failSave) throw Error('Full');
    memory.set(k, v);
  },
  removeItem: (k) => memory.delete(k),
};
const r = await load('routines'),
  s = await load('storage');
const { useAppStore } = await load('appStore');
const at = new Date('2026-09-10T12:00:00+01:00');
const fixture = JSON.parse(await readFile('scripts/release-a/fixtures/v1.json', 'utf8'));
let checks = 0;
const test = (name, fn) => {
  fn();
  checks++;
  console.log('✓ ' + name);
};
const input = {
  title: 'Take a quiet break',
  category: 'rest',
  activity: 'sand',
  days: [0, 1, 2, 3, 4, 5, 6],
  startDate: '2026-09-10',
};
const make = (id = 'quiet') => r.saveRoutine(s.parseData(fixture), input, id, at, false);
const medical = (d) =>
  JSON.stringify({
    medications: d.medications,
    records: d.records,
    reminders: d.reminders,
    care: d.care,
    preferences: d.preferences,
    medRewards: d.market.checkInRewards,
    orders: d.market.orders,
    owned: d.market.ownedRoomItems,
  });
test('v1 migrates to empty self-care without altering old values; backup round trip', () => {
  const d = s.parseData(fixture);
  assert.equal(d.schemaVersion, 2);
  assert.deepEqual(d.selfCare, r.emptySelfCare());
  const { schemaVersion, selfCare, ...rest } = d;
  const { schemaVersion: old, ...before } = fixture;
  assert.deepEqual(rest, before);
  assert.deepEqual(s.parseBackup(s.backupText(d)), d);
});
test('unknown future and malformed v2 are refused', () => {
  assert.throws(() => s.parseData({ ...fixture, schemaVersion: 99 }));
  assert.throws(() => s.parseData({ ...fixture, schemaVersion: 2 }));
});
test('one occurrence per local day and no pre-creation backlog', () => {
  const d = make();
  assert.equal(r.routinesForDay(d, '2026-09-09').length, 0);
  assert.equal(r.routinesForDay(d, '2026-09-10').length, 1);
  assert.equal(r.routinesForDay(d, '2026-09-11').length, 1);
});
test('Done and Not today receive identical bounded rewards, separate from health', () => {
  for (const status of ['done', 'skipped']) {
    const d = make();
    const n = r.recordRoutine(d, 'quiet@2026-09-10', status, at);
    assert.equal(n.market.coins, d.market.coins + 5);
    assert.equal(medical(n), medical(d));
    assert.deepEqual(s.parseData(n), n);
  }
});
test('undo / status edits / relog cannot mint again', () => {
  let d = r.recordRoutine(make(), 'quiet@2026-09-10', 'done', at);
  const coins = d.market.coins;
  d = r.undoRoutine(d, 'quiet@2026-09-10');
  assert.equal(Object.keys(d.selfCare.records).length, 0);
  d = r.recordRoutine(d, 'quiet@2026-09-10', 'skipped', at);
  assert.equal(d.market.coins, coins);
});
test('daily cap has durable zero markers; clock rewind does not reset it', () => {
  let d = s.parseData(fixture);
  for (let i = 0; i < 5; i++) {
    d = r.saveRoutine(d, input, 'q' + i, at, false);
    d = r.recordRoutine(d, `q${i}@2026-09-10`, 'done', at);
  }
  assert.equal(d.market.coins, fixture.market.coins + 15);
  assert.equal(d.selfCare.rewards['q4@2026-09-10'].amount, 0);
  const rewind = r.recordRoutine(
    r.undoRoutine(d, 'q0@2026-09-10'),
    'q0@2026-09-10',
    'done',
    new Date('2026-09-10T00:01:00+01:00'),
  );
  assert.equal(rewind.market.coins, d.market.coins);
});
test('historical/future occurrences have zero markers with actual reward-day key', () => {
  for (const day of ['2026-09-11', '2026-09-09']) {
    const now = new Date(day + 'T12:00:00+01:00');
    const d = r.recordRoutine(make(), 'quiet@2026-09-10', 'done', now);
    assert.equal(d.market.coins, fixture.market.coins);
    assert.deepEqual(d.selfCare.rewards['quiet@2026-09-10'], { amount: 0, rewardDay: day });
    assert.equal(d.selfCare.records['quiet@2026-09-10'].date, '2026-09-10');
  }
});
test('wallet limit stays bounded', () => {
  const d = make();
  d.market.coins = 999998;
  const n = r.recordRoutine(d, 'quiet@2026-09-10', 'done', at);
  assert.equal(n.market.coins, 1000000);
  assert.equal(n.selfCare.rewards['quiet@2026-09-10'].amount, 2);
});
test('edits affect tomorrow, optional time never changes identity', () => {
  let d = make();
  d = r.saveRoutine(d, { ...input, days: [0], time: '18:00' }, 'quiet', at, true);
  assert.equal(r.routinesForDay(d, '2026-09-10')[0].id, 'quiet@2026-09-10');
  assert.equal(r.routinesForDay(d, '2026-09-11').length, 0);
  assert.equal(d.selfCare.routines[0].schedules.length, 2);
});
test('pause/archive preserve history, cancel future schedules; resume is explicit', () => {
  let d = r.recordRoutine(make(), 'quiet@2026-09-10', 'done', at);
  d = r.setRoutineStatus(d, 'quiet', 'archived', at);
  assert.equal(r.routinesForDay(d, '2026-09-11').length, 0);
  assert.equal(r.routinesForDay(d, '2026-09-10')[0].record.status, 'done');
  assert.equal(Object.keys(d.selfCare.rewards).length, 1);
});
test('Later and keep-today-small are display-only, reversible and expire each day', () => {
  const d = make();
  let n = r.laterRoutine(d, 'quiet@2026-09-10', at);
  assert.equal(n.market.coins, d.market.coins);
  assert.equal(Object.keys(n.selfCare.records).length, 0);
  n = r.hideRoutinesToday(n, ['quiet@2026-09-10'], true, at);
  assert.equal(r.routinesForDay(n, '2026-09-10')[0].override.hiddenForToday, true);
  assert.equal(r.routinesForDay(n, '2026-09-11')[0].override, undefined);
  n = r.hideRoutinesToday(n, ['quiet@2026-09-10'], false, at);
  assert.deepEqual(n.selfCare.routines, d.selfCare.routines);
  assert.equal(medical(n), medical(d));
});
test('invalid schedules, orphan records, duplicate definitions and ledger omissions rejected', () => {
  const d = make();
  const invalid = [
    { ...d.selfCare, routines: [...d.selfCare.routines, ...d.selfCare.routines] },
    {
      ...d.selfCare,
      routines: [
        { ...d.selfCare.routines[0], schedules: [{ from: 'bad', days: [], active: true }] },
      ],
    },
  ];
  for (const selfCare of invalid) assert.throws(() => s.parseData({ ...d, selfCare }));
  const n = r.recordRoutine(d, 'quiet@2026-09-10', 'done', at);
  n.selfCare.rewards = {};
  assert.throws(() => s.parseData(n));
});
test('migration backup is durable and failure does not overwrite v1', () => {
  memory.clear();
  memory.set(s.STORAGE_KEY, JSON.stringify(fixture));
  failSave = true;
  useAppStore.getState().sync();
  assert.equal(JSON.parse(memory.get(s.STORAGE_KEY)).schemaVersion, 1);
  failSave = false;
  useAppStore.getState().sync();
  assert.equal(JSON.parse(memory.get(s.STORAGE_KEY)).schemaVersion, 2);
  assert.deepEqual(JSON.parse(memory.get(s.MIGRATION_BACKUP_KEY)), fixture);
});
test('failed atomic store action saves neither record nor reward', () => {
  const store = useAppStore.getState();
  assert.equal(store.restore(make()).ok, true);
  const before = memory.get(s.STORAGE_KEY),
    coins = useAppStore.getState().data.market.coins;
  failSave = true;
  assert.equal(useAppStore.getState().recordRoutine('quiet@2026-09-10', 'done').ok, false);
  failSave = false;
  assert.equal(memory.get(s.STORAGE_KEY), before);
  assert.equal(useAppStore.getState().data.market.coins, coins);
});

const mood = await load('companion'),
  planner = await load('nativePlanner'),
  cloud = await load('cloudPayload');
test('Medication mood boundaries match baseline before and after optional actions', () => {
  const start = new Date('2026-09-10T08:00:00+01:00');
  let d = make();
  d.records = {};
  d.medications[0].schedules = [
    { from: '2026-09-10', days: [0, 1, 2, 3, 4, 5, 6], times: ['08:00'], active: true },
  ];
  for (const [hours, expected] of [
    [1.999, 'idle'],
    [2, 'worried'],
    [23.999, 'worried'],
    [24, 'sick'],
    [71.999, 'sick'],
    [72, 'critical'],
  ]) {
    const now = new Date(+start + hours * 3600000);
    assert.equal(mood.companionMood(d, now), expected);
    const n = r.recordRoutine(d, 'quiet@2026-09-10', 'done', now);
    assert.equal(mood.companionMood(n, now), expected);
  }
});
test('Latest taken OR skipped medication record resets old gaps, not opening or optional records', () => {
  const d = make();
  d.records = {};
  const now = new Date('2026-09-10T12:00:00+01:00');
  assert.equal(mood.companionMood(d, now), 'critical');
  for (const status of ['taken', 'skipped']) {
    const n = structuredClone(d);
    const id = 'baseline-med@2026-09-10@09:00';
    n.records[id] = {
      ...fixture.records['baseline-med@2026-09-02@08:00'],
      id,
      date: '2026-09-10',
      time: '09:00',
      status,
      recordedAt: now.toISOString(),
    };
    assert.equal(mood.companionMood(n, now), 'idle');
  }
});
test('Archived/paused medication and Gentle moods keep existing behaviour; preview is pure', () => {
  for (const status of ['archived', 'paused']) {
    const d = make();
    d.records = {};
    if (status === 'archived') d.medications[0].archived = true;
    else d.medications[0].schedules.at(-1).active = false;
    assert.equal(mood.companionMood(d, at), 'idle');
  }
  const d = make();
  d.records = {};
  const before = JSON.stringify(d);
  assert.equal(mood.presentedCompanionMood(d, at, 'capped-preview'), 'worried');
  assert.equal(mood.presentedCompanionMood(d, at), 'critical');
  assert.equal(JSON.stringify(d), before);
  d.preferences.gentleMoods = true;
  assert.equal(mood.presentedCompanionMood(d, at), 'idle');
  assert.equal(mood.presentedCompanionMood(d, at, 'capped-preview'), 'idle');
});
test('Optional completion/hide/later leave native notification plan byte-equivalent', () => {
  const d = make();
  d.preferences.reminders = true;
  let n = r.recordRoutine(d, 'quiet@2026-09-10', 'skipped', at);
  n = r.undoRoutine(n, 'quiet@2026-09-10');
  n = r.laterRoutine(n, 'quiet@2026-09-10', at);
  n = r.hideRoutinesToday(n, ['quiet@2026-09-10'], true, at);
  assert.deepEqual(planner.planNativeReminders(n, at), planner.planNativeReminders(d, at));
});
test('Midnight/DST/timezone changes preserve occurrence IDs and existing record timestamps', () => {
  const start = new Date('2026-10-24T12:00:00+01:00');
  let d = r.saveRoutine(
    s.parseData(fixture),
    { ...input, startDate: '2026-10-24' },
    'dst',
    start,
    false,
  );
  d = r.recordRoutine(d, 'dst@2026-10-24', 'done', new Date('2026-10-24T23:59:00+01:00'));
  d = r.recordRoutine(d, 'dst@2026-10-25', 'done', new Date('2026-10-25T00:01:00+01:00'));
  assert.equal(d.market.coins, fixture.market.coins + 10);
  const recorded = d.selfCare.records['dst@2026-10-25'].recordedAt;
  for (const time of ['2026-10-25T01:30:00+01:00', '2026-10-25T01:30:00+00:00'])
    d = r.recordRoutine(d, 'dst@2026-10-25', 'skipped', new Date(time));
  process.env.TZ = 'America/Los_Angeles';
  d = r.recordRoutine(d, 'dst@2026-10-25', 'done', new Date('2026-10-25T02:00:00Z'));
  process.env.TZ = 'Europe/London';
  assert.equal(d.market.coins, fixture.market.coins + 10);
  assert.equal(d.selfCare.records['dst@2026-10-25'].recordedAt, recorded);
  assert.equal(d.selfCare.records['dst@2026-10-25'].date, '2026-10-25');
});
test('Whole-copy cloud choice replaces routine ledger and coins together, excludes device reminders', () => {
  const local = make(),
    remote = r.recordRoutine(local, 'quiet@2026-09-10', 'done', at);
  const pulled = cloud.applyCloudData(remote, local, true);
  assert.deepEqual(pulled.selfCare, remote.selfCare);
  assert.equal(pulled.market.coins, remote.market.coins);
  assert.deepEqual(pulled.reminders, local.reminders);
  assert.deepEqual(cloud.cloudPayload(remote).reminders, {});
  const changed = structuredClone(remote);
  changed.selfCare.records['quiet@2026-09-10'].status = 'skipped';
  assert.notEqual(cloud.cloudFingerprint(changed), cloud.cloudFingerprint(remote));
});
test('Unknown future local/cloud versions cannot overwrite local data', () => {
  const d = make();
  useAppStore.getState().restore(d);
  const original = memory.get(s.STORAGE_KEY);
  assert.equal(useAppStore.getState().applyCloud({ ...d, schemaVersion: 99 }, null).ok, false);
  assert.equal(memory.get(s.STORAGE_KEY), original);
  memory.set(s.STORAGE_KEY, JSON.stringify({ ...d, schemaVersion: 99 }));
  const future = memory.get(s.STORAGE_KEY);
  assert.equal(useAppStore.getState().restore(d).ok, false);
  assert.equal(memory.get(s.STORAGE_KEY), future);
});
test('Pause/resume never brings tomorrow’s edited time forward to today', () => {
  let d = r.saveRoutine(s.parseData(fixture), { ...input, time: '16:30' }, 'quiet', at, false);
  d = r.saveRoutine(d, { ...input, time: '19:00' }, 'quiet', at, true);
  d = r.setRoutineStatus(d, 'quiet', 'paused', at);
  d = r.setRoutineStatus(d, 'quiet', 'active', at);
  assert.equal(r.routinesForDay(d, '2026-09-10')[0].schedule.time, '16:30');
  assert.equal(r.routinesForDay(d, '2026-09-11')[0].schedule.time, '19:00');
});
console.log(`${checks} Release A contracts passed.`);
