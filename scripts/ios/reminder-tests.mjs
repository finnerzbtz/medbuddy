import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
process.env.TZ = 'Europe/London';
const out = path.resolve('rebuild/generated/qa-ios');
await mkdir(out, { recursive: true });
const pending = new Map(),
  delivered = new Map(),
  preferences = new Map(),
  memory = new Map();
let allowed = 'granted',
  calls = 0,
  fail = false,
  silentFailure = false,
  delayedDelivery = false,
  failNativeBackup = false;
globalThis.localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
};
globalThis.window = new EventTarget();
globalThis.nativeTest = {
  LocalNotifications: {
    checkPermissions: async () => ({ display: allowed }),
    requestPermissions: async () => ({ display: allowed }),
    getPending: async () => ({ notifications: [...pending.values()] }),
    getDeliveredNotifications: async () => ({ notifications: [...delivered.values()] }),
    cancel: async ({ notifications }) => notifications.forEach(({ id }) => pending.delete(id)),
    removeDeliveredNotifications: async ({ notifications }) =>
      notifications.forEach(({ id }) => delivered.delete(id)),
    schedule: async ({ notifications }) => {
      calls++;
      if (fail) throw new Error('Test OS failure');
      if (silentFailure) return;
      const store = () => {
        for (const n of notifications) pending.set(n.id, n);
      };
      if (delayedDelivery) setTimeout(store, 80);
      else store();
    },
  },
  Preferences: {
    get: async ({ key }) => ({ value: preferences.get(key) ?? null }),
    set: async ({ key, value }) => {
      if (failNativeBackup && key.endsWith(':before-v2')) throw Error('Native backup full');
      preferences.set(key, value);
    },
  },
};
await build({
  entryPoints: {
    planner: 'src/domain/native-reminders.ts',
    scheduler: 'src/native/reminders.ts',
    storage: 'src/domain/storage.ts',
    nativeStorage: 'src/native/storage.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outdir: out,
  plugins: [
    {
      name: 'test-native-bridge',
      setup(b) {
        b.onResolve({ filter: /^@capacitor\// }, (args) => ({
          path: args.path,
          namespace: 'mock',
        }));
        b.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path: name }) => ({
          contents: name.endsWith('/core')
            ? 'export const Capacitor = { isNativePlatform: () => true };'
            : name.endsWith('/preferences')
              ? 'export const Preferences = globalThis.nativeTest.Preferences;'
              : 'export const LocalNotifications = globalThis.nativeTest.LocalNotifications;',
        }));
      },
    },
  ],
});
const load = (name) => import(pathToFileURL(path.join(out, name + '.js')));
const { planNativeReminders } = await load('planner');
const { syncNativeReminders, testNativeReminder, REMINDER_TEST_ID, REMINDER_REFRESH_ID } =
  await load('scheduler');
const { hydrateNativeStorage, persistNativeStorage } = await load('nativeStorage');
const { emptyData, STORAGE_KEY, MIGRATION_BACKUP_KEY } = await load('storage');
const now = new Date('2026-09-07T10:00:00+01:00');
const future = new Date();
future.setDate(future.getDate() + 1);
const dayKey = (d) =>
  [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
function data(day = '2026-09-07') {
  const value = emptyData();
  value.preferences.reminders = true;
  value.medications = [
    {
      id: 'test-med',
      name: 'Private medicine',
      dosage: '1 tablet',
      color: '#738962',
      instructions: '',
      createdAt: now.toISOString(),
      archived: false,
      stock: null,
      schedules: [
        {
          from: day,
          times: ['09:00', '12:00', '18:00'],
          days: [0, 1, 2, 3, 4, 5, 6],
          active: true,
        },
      ],
    },
  ];
  return value;
}
const cases = [];
async function test(name, fn) {
  await fn();
  cases.push(name);
  console.log('✓ ' + name);
}
await test('Future-only queue stays within the iOS budget with stable unique IDs', () => {
  const plan = planNativeReminders(data(), now);
  assert.equal(plan.length, 60);
  assert.ok(plan.every((n) => +n.at > +now));
  assert.equal(new Set(plan.map((n) => n.id)).size, 60);
  assert.deepEqual(plan, planNativeReminders(data(), now));
});
await test('Simultaneous medications share one private alert', () => {
  const d = data();
  d.medications.push({ ...d.medications[0], id: 'another' });
  assert.equal(planNativeReminders(d, now)[0].doseIds.length, 2);
});
await test('Taken and skipped doses are absent; undo restores their future alerts', () => {
  const d = data(),
    id = planNativeReminders(d, now)[0].doseIds[0];
  for (const status of ['taken', 'skipped']) {
    d.records[id] = { id, medicationId: 'test-med', date: '2026-09-07', time: '12:00', status };
    assert.ok(!planNativeReminders(d, now).some((n) => n.doseIds.includes(id)));
  }
  delete d.records[id];
  assert.ok(planNativeReminders(d, now).some((n) => n.doseIds.includes(id)));
});
await test('Paused, archived and disabled reminders cancel upcoming alerts', () => {
  const d = data();
  d.medications[0].archived = true;
  assert.equal(planNativeReminders(d, now).length, 0);
  d.medications[0].archived = false;
  d.medications[0].schedules[0].active = false;
  assert.equal(planNativeReminders(d, now).length, 0);
  d.medications[0].schedules[0].active = true;
  d.preferences.reminders = false;
  assert.equal(planNativeReminders(d, now).length, 0);
});
await test('Schedule revisions replace future times without changing today', () => {
  const d = data();
  d.medications[0].schedules.push({
    ...d.medications[0].schedules[0],
    from: '2026-09-08',
    times: ['16:00'],
  });
  const plan = planNativeReminders(d, now);
  assert.equal(plan[0].at.getHours(), 12);
  assert.equal(plan[2].at.getHours(), 16);
});
await test('Cross-midnight snoozes fire once and are removed on pause', () => {
  const d = data('2026-09-06'),
    id = 'test-med@2026-09-06@18:00';
  d.reminders[id] = { snoozedUntil: '2026-09-07T11:00:00+01:00' };
  assert.deepEqual(planNativeReminders(d, now)[0].doseIds, [id]);
  d.medications[0].schedules.push({
    ...d.medications[0].schedules[0],
    from: '2026-09-07',
    active: false,
  });
  assert.equal(planNativeReminders(d, now).length, 0);
});
await test('Local medication time is preserved across the daylight-saving boundary', () => {
  const d = data('2026-10-24');
  d.medications[0].schedules[0].times = ['09:00'];
  const plan = planNativeReminders(d, new Date('2026-10-24T08:00:00+01:00'));
  assert.equal(plan[0].at.getHours(), 9);
  assert.equal(plan[1].at.getHours(), 9);
  assert.equal(+plan[1].at - +plan[0].at, 25 * 60 * 60 * 1000);
});
await test('OS queue is deduplicated, private, and includes its renewal alert', async () => {
  const d = data(dayKey(future));
  await syncNativeReminders(d);
  const initial = calls;
  await syncNativeReminders(d);
  assert.equal(calls, initial);
  assert.ok(pending.has(REMINDER_REFRESH_ID));
  assert.ok(pending.size <= 61);
  assert.ok(
    [...pending.values()].every(
      (n) => !n.body.includes('Private medicine') && !n.title.includes('Private medicine'),
    ),
  );
});
await test('An OS scheduling error is surfaced and a later sync retries', async () => {
  pending.clear();
  fail = true;
  await assert.rejects(syncNativeReminders(data(dayKey(future))));
  ((fail = false), (failNativeBackup = false));
  await syncNativeReminders(data(dayKey(future)));
  assert.ok(pending.size > 0);
});
await test('An early iOS acknowledgement is verified after the pending queue catches up', async () => {
  pending.clear();
  delayedDelivery = true;
  const confirmed = await syncNativeReminders(data(dayKey(future)));
  delayedDelivery = false;
  assert.equal(confirmed.count, 60);
  assert.ok(confirmed.through);
  assert.ok([...pending.values()].every((n) => n.foreground === true));
});
await test('A silently dropped OS schedule is not reported as successful', async () => {
  pending.clear();
  silentFailure = true;
  await assert.rejects(syncNativeReminders(data(dayKey(future))), /did not confirm/);
  await assert.rejects(testNativeReminder(), /did not confirm/);
  silentFailure = false;
  await syncNativeReminders(data(dayKey(future)));
});
await test('The verified test alert leaves enough time to lock the phone', async () => {
  const start = Date.now();
  await testNativeReminder();
  const test = pending.get(REMINDER_TEST_ID);
  assert.ok(+test.schedule.at >= start + 10000);
  assert.equal(test.foreground, true);
  await syncNativeReminders(data(dayKey(future)));
  assert.ok(pending.has(REMINDER_TEST_ID), 'Enabled reminder refresh must not cancel the test');
});
await test('Turning reminders off wins over an in-flight schedule call', async () => {
  pending.set(2100000002, { id: 2100000002 });
  const d = data(dayKey(future)),
    off = { ...d, preferences: { ...d.preferences, reminders: false } };
  await Promise.all([syncNativeReminders(d), syncNativeReminders(off)]);
  assert.equal(pending.size, 0);
});
await test('Denied permission never schedules or prompts automatically', async () => {
  allowed = 'denied';
  const before = calls;
  await syncNativeReminders(data(dayKey(future)));
  assert.equal(calls, before);
  assert.equal(pending.size, 0);
});
await test('Durable native storage restores a cleared webview before app startup', async () => {
  const d = emptyData();
  d.profile.name = 'Native test';
  preferences.set(STORAGE_KEY, JSON.stringify(d));
  await hydrateNativeStorage();
  assert.equal(JSON.parse(memory.get(STORAGE_KEY)).profile.name, 'Native test');
});
await test('A newer local write survives a stale native copy', async () => {
  const d = emptyData();
  d.updatedAt = '2099-01-01T00:00:00.000Z';
  d.profile.name = 'Latest';
  memory.set(STORAGE_KEY, JSON.stringify(d));
  await hydrateNativeStorage();
  assert.equal(JSON.parse(preferences.get(STORAGE_KEY)).profile.name, 'Latest');
});
await test('Corrupt data is retained and blocks silent overwrite', async () => {
  memory.set(STORAGE_KEY, 'broken');
  await assert.rejects(hydrateNativeStorage());
  assert.equal(memory.get(STORAGE_KEY), 'broken');
});

await test('v1 native hydration retains exact prior snapshot and migrates without losing ownership', async () => {
  const original = await readFile('scripts/release-a/fixtures/v1.json', 'utf8');
  memory.clear();
  preferences.clear();
  preferences.set(STORAGE_KEY, original);
  await hydrateNativeStorage();
  assert.equal(preferences.get(MIGRATION_BACKUP_KEY), original);
  assert.equal(JSON.parse(memory.get(STORAGE_KEY)).schemaVersion, 2);
  assert.deepEqual(JSON.parse(memory.get(STORAGE_KEY)).market, JSON.parse(original).market);
});
await test('Failed native migration backup keeps original snapshot intact', async () => {
  const original = await readFile('scripts/release-a/fixtures/v1.json', 'utf8');
  memory.clear();
  preferences.clear();
  preferences.set(STORAGE_KEY, original);
  failNativeBackup = true;
  await assert.rejects(hydrateNativeStorage());
  failNativeBackup = false;
  assert.equal(preferences.get(STORAGE_KEY), original);
  assert.equal(JSON.parse(memory.get(STORAGE_KEY)).schemaVersion, 1);
  await hydrateNativeStorage();
  assert.equal(JSON.parse(preferences.get(STORAGE_KEY)).schemaVersion, 2);
});
await test('Unknown future native schema refuses hydration and preserves both copies', async () => {
  const browser = JSON.stringify(emptyData()),
    future = JSON.stringify({ ...emptyData(), schemaVersion: 3 });
  memory.set(STORAGE_KEY, browser);
  preferences.set(STORAGE_KEY, future);
  await assert.rejects(hydrateNativeStorage());
  assert.equal(memory.get(STORAGE_KEY), browser);
  assert.equal(preferences.get(STORAGE_KEY), future);
  preferences.set(STORAGE_KEY, browser);
});
await test('An older-schema native copy cannot silently erase newer local routines', async () => {
  const old = JSON.parse(await readFile('scripts/release-a/fixtures/v1.json', 'utf8'));
  old.updatedAt = '2099-01-01T00:00:00.000Z';
  const browser = JSON.stringify(emptyData());
  memory.set(STORAGE_KEY, browser);
  preferences.set(STORAGE_KEY, JSON.stringify(old));
  await assert.rejects(hydrateNativeStorage());
  assert.equal(memory.get(STORAGE_KEY), browser);
  preferences.set(STORAGE_KEY, browser);
});
await test('Queued saves retain the latest change including reset', async () => {
  persistNativeStorage(
    JSON.stringify({ ...emptyData(), profile: { name: 'First', petName: 'Blobby' } }),
  );
  persistNativeStorage(
    JSON.stringify({ ...emptyData(), profile: { name: 'Last', petName: 'Blobby' } }),
  );
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(JSON.parse(preferences.get(STORAGE_KEY)).profile.name, 'Last');
});
await writeFile(
  path.join(out, 'results.json'),
  JSON.stringify({ passed: cases.length, cases }, null, 2) + '\n',
);
