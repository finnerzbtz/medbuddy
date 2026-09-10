import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
const secret = await readFile('/tmp/reminduh-release-a-validation.env', 'utf8');
const url = new URL(secret.trim().slice(13));
if (!url.hostname.startsWith('ep-lucky-flower-zawfn6wc')) throw Error('Validation branch only.');
url.hostname = url.hostname.replace('-pooler', '');
url.searchParams.set('sslmode', 'verify-full');
const client = new pg.Client({ connectionString: url.toString() });
const checks = [];
const check = (name, value) => {
  assert.ok(value, name);
  checks.push(name);
  console.log('✓ ' + name);
};
await client.connect();
try {
  await migrate(drizzle(client), { migrationsFolder: 'database/migrations' });
  await client.query('BEGIN');
  const uid = crypto.randomUUID();
  await client.query(
    `INSERT INTO neon_auth."user" (id,name,email,"emailVerified") VALUES ($1,'Release A fixture',$2,true)`,
    [uid, `release-a-${uid}@example.invalid`],
  );
  await client.query("SELECT set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: uid }),
  ]);
  const current = (await client.query('SELECT auth.user_id() AS id')).rows[0].id;
  check('Development identity helper accepts isolated transaction claims', current === uid);
  const protocol = (await client.query('SELECT public.reminduh_protocol() AS value')).rows[0].value;
  check(
    'v2 server capability and monotonic version guarantee',
    protocol.maxSchema === 2 && protocol.monotonicSchema,
  );
  const v1 = JSON.parse(await readFile('scripts/release-a/fixtures/v1.json', 'utf8'));
  const { parseData } = await import('../../rebuild/generated/release-a/storage.js');
  const { saveRoutine, recordRoutine } = await import(
    '../../rebuild/generated/release-a/routines.js'
  );
  const clock = new Date('2026-09-10T12:00:00+01:00');
  const v2 = recordRoutine(
    saveRoutine(
      parseData(v1),
      {
        title: 'Take a quiet break',
        category: 'rest',
        activity: 'sand',
        startDate: '2026-09-10',
        days: [0, 1, 2, 3, 4, 5, 6],
      },
      'quiet',
      clock,
      false,
    ),
    'quiet@2026-09-10',
    'skipped',
    clock,
  );
  const save = async (d, rev) =>
    (
      await client.query('SELECT public.reminduh_save($1,$2::jsonb) AS value', [
        rev,
        JSON.stringify(d),
      ])
    ).rows[0].value;
  const read = async () =>
    (await client.query('SELECT public.reminduh_read() AS value')).rows[0].value;
  const a = await save(v1, 0);
  check(
    'v1 remains readable and writable before upgrade',
    a.revision === 1 && a.data.schemaVersion === 1,
  );
  const b = await save(v2, 1);
  check(
    'v2 round trip retains routine record, ledger and wallet',
    b.revision === 2 &&
      b.data.selfCare.records['quiet@2026-09-10'].status === 'skipped' &&
      b.data.market.coins === v2.market.coins,
  );
  assert.deepEqual(b.data.selfCare, v2.selfCare);
  check(
    'Stale v2 CAS returns a whole-copy conflict',
    (await save({ ...v2, profile: { ...v2.profile, name: 'Stale' } }, 1)).status === 'conflict',
  );
  for (const [name, payload, rev, code] of [
    ['Old v1 cannot erase v2 at current revision', v1, 2, 'PT409'],
    ['Old v1 cannot erase v2 even with stale revision', v1, 1, 'PT409'],
    ['Unknown future schema cannot overwrite v2', { ...v2, schemaVersion: 99 }, 2, 'PT409'],
    [
      'Malformed v2 cannot omit reward ledger',
      { ...v2, selfCare: { ...v2.selfCare, rewards: {} } },
      2,
      '22023',
    ],
    [
      'Invalid routine days rejected',
      {
        ...v2,
        selfCare: {
          ...v2.selfCare,
          routines: [
            {
              ...v2.selfCare.routines[0],
              schedules: [{ from: '2026-09-10', days: [8], active: true }],
            },
          ],
        },
      },
      2,
      '22023',
    ],
  ]) {
    await client.query('SAVEPOINT rejected_write');
    let failure;
    try {
      await save(payload, rev);
    } catch (e) {
      failure = e;
    }
    assert.equal(failure?.code, code, name);
    await client.query('ROLLBACK TO SAVEPOINT rejected_write');
    const after = await read();
    assert.deepEqual(after, { data: b.data, revision: b.revision, updatedAt: b.updatedAt });
    check(name, true);
  }
  const other = crypto.randomUUID();
  await client.query(
    `INSERT INTO neon_auth."user" (id,name,email,"emailVerified") VALUES ($1,'Other fixture',$2,true)`,
    [other, `release-a-${other}@example.invalid`],
  );
  await client.query("SELECT set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: other }),
  ]);
  check('Account isolation keeps optional health snapshots separate', (await read()).data === null);
  await client.query('ROLLBACK');
  await writeFile(
    'rebuild/generated/release-a/cloud-results.json',
    JSON.stringify(
      {
        branch: 'br-green-lab-zaxqbso9',
        checks,
        passed: checks.length,
        transport: 'Direct PostgreSQL, transaction-scoped synthetic claims; production untouched',
      },
      null,
      2,
    ),
  );
} finally {
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
}
