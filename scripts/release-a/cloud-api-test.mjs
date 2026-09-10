import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import pg from 'pg';
const root = new URL('../../', import.meta.url);
const env = await readFile('/tmp/reminduh-release-a-validation.env', 'utf8');
const connectionString = env
  .split('\n')
  .find((x) => x.startsWith('DATABASE_URL='))
  ?.slice(13);
if (!connectionString || !connectionString.includes('ep-lucky-flower-zawfn6wc'))
  throw new Error('Tests require the isolated development branch.');
const pool = new pg.Pool({ connectionString, max: 2 });
const auth = 'https://ep-lucky-flower-zawfn6wc.neonauth.c-2.eu-west-2.aws.neon.tech/reminduh/auth';
const api = 'https://ep-lucky-flower-zawfn6wc.apirest.c-2.eu-west-2.aws.neon.tech/reminduh/rest/v1';
const origin = 'http://127.0.0.1:5189';
const out = new URL('rebuild/generated/release-a/cloud/', root);
await mkdir(new URL('private/', out), { recursive: true });
await build({
  entryPoints: [fileURLToPath(new URL('src/domain/storage.ts', root))],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: fileURLToPath(new URL('private/domain.mjs', out)),
});
const { emptyData, parseData } = await import(new URL('private/domain.mjs', out));
const checks = [];
const check = (name, condition = true) => {
  assert(condition, name);
  checks.push(name);
};
async function request(path, body, cookie = '') {
  const response = await fetch(auth + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => null);
  return {
    response,
    data,
    cookie: response.headers
      .getSetCookie()
      .map((x) => x.split(';')[0])
      .join('; '),
  };
}
async function session(user) {
  const { response, data } = await request('/get-session', null, user.cookie);
  assert.equal(response.status, 200);
  assert.equal(data.user.id, user.id);
  return response.headers.get('set-auth-jwt');
}
async function rpc(user, method, args = {}) {
  const token = user ? await session(user) : null;
  const response = await fetch(api + '/rpc/' + method, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify(args),
  });
  return { response, data: await response.json().catch(() => null) };
}
async function newUser(suffix) {
  const email = `reminduh-integration-${Date.now()}-${suffix}@example.invalid`;
  const password = randomBytes(24).toString('base64url');
  const signup = await request('/sign-up/email', {
    email,
    password,
    name: 'Synthetic integration test',
  });
  assert.equal(signup.response.status, 200);
  return {
    id: signup.data.user.id,
    email,
    password,
    cookie: signup.cookie,
    confirmationToken: signup.data.token,
  };
}
try {
  const a = await newUser('a'),
    b = await newUser('b');
  const privatePath = new URL('private/accounts.json', out);
  await writeFile(privatePath, JSON.stringify({ a, b }), { mode: 0o600 });
  check('Unauthenticated reads denied', (await rpc(null, 'reminduh_read')).response.status >= 400);
  check('Unverified account denied', (await rpc(a, 'reminduh_read')).response.status >= 400);
  await pool.query(
    'UPDATE neon_auth."user" SET "emailVerified" = true WHERE id = ANY($1::uuid[])',
    [[a.id, b.id]],
  );
  // Auth caches the user in the session. A fresh sign-in creates the verified claim.
  for (const user of [a, b]) {
    const signin = await request('/sign-in/email', { email: user.email, password: user.password });
    user.cookie = signin.cookie;
    user.confirmationToken = signin.data.token;
  }
  await writeFile(privatePath, JSON.stringify({ a, b }), { mode: 0o600 });
  const data = emptyData();
  data.onboarded = true;
  data.profile = { name: 'Cloud test', petName: 'Pip' };
  data.medications = [
    {
      id: 'sample-med',
      name: 'Sample medication',
      dosage: '10 mg · 1 tablet',
      strengthMg: 10,
      tabletsPerDose: 1,
      instructions: '',
      color: '#758865',
      createdAt: new Date().toISOString(),
      archived: false,
      schedules: [
        { from: '2026-09-08', active: true, times: ['08:00'], days: [0, 1, 2, 3, 4, 5, 6] },
      ],
      stock: null,
      refillAt: 5,
    },
  ];
  const id = 'sample-med@2026-09-08@08:00';
  data.records[id] = {
    id,
    medicationId: 'sample-med',
    date: '2026-09-08',
    time: '08:00',
    name: 'Sample medication',
    dosage: '10 mg · 1 tablet',
    strengthMg: 10,
    tabletsPerDose: 1,
    instructions: '',
    color: '#758865',
    status: 'taken',
    recordedAt: new Date().toISOString(),
    note: '',
  };
  data.selfCare = {
    routines: [
      {
        id: 'quiet',
        title: 'Take a quiet break',
        category: 'rest',
        activity: 'sand',
        createdAt: new Date().toISOString(),
        archived: false,
        schedules: [{ from: '2026-09-10', days: [0, 1, 2, 3, 4, 5, 6], active: true }],
      },
    ],
    records: {
      'quiet@2026-09-10': {
        id: 'quiet@2026-09-10',
        routineId: 'quiet',
        date: '2026-09-10',
        title: 'Take a quiet break',
        category: 'rest',
        status: 'skipped',
        recordedAt: new Date().toISOString(),
      },
    },
    rewards: { 'quiet@2026-09-10': { amount: 5, rewardDay: '2026-09-10' } },
    overrides: {},
    introductionDismissed: true,
  };
  data.preferences.reminders = true;
  data.reminders[id] = { notifiedAt: new Date().toISOString() };
  let result = await rpc(a, 'reminduh_save', { expected_revision: 0, payload: data });
  if (!result.response.ok) console.log('Save error:', result.response.status, result.data);
  check(
    'Create cloud account with medication and check-in',
    result.response.ok && result.data.revision === 1,
  );
  parseData(result.data.data);
  check(
    'Real JWT/RPC round trip retains optional routine state',
    result.data.data.selfCare.records['quiet@2026-09-10'].status === 'skipped',
  );
  const legacy = { ...data, schemaVersion: 1 };
  delete legacy.selfCare;
  const downgrade = await rpc(a, 'reminduh_save', { expected_revision: 1, payload: legacy });
  check(
    'Real API returns readable 409 to old client without erasing v2',
    downgrade.response.status === 409 && downgrade.data.message.includes('Update Reminduh'),
  );

  check(
    'Device reminder state excluded',
    !result.data.data.preferences.reminders && Object.keys(result.data.data.reminders).length === 0,
  );
  check(
    'Second account cannot see first account',
    (await rpc(b, 'reminduh_read')).data.revision === 0,
  );
  check(
    'Stale revision cannot overwrite',
    (await rpc(a, 'reminduh_save', { expected_revision: 0, payload: emptyData() })).data.status ===
      'conflict',
  );
  const [first, second] = await Promise.all([
    rpc(a, 'reminduh_save', { expected_revision: 1, payload: data }),
    rpc(a, 'reminduh_save', { expected_revision: 1, payload: data }),
  ]);
  check(
    'Concurrent writes accept exactly one',
    [first.data.status, second.data.status].filter((x) => x === 'saved').length === 1,
  );
  const token = await session(a);
  const direct = await fetch(api + '/reminduh_accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ user_id: b.id, revision: 99, settings: {} }),
  });
  check('Direct table writes denied', direct.status >= 400);
  const corrupt = structuredClone(data);
  corrupt.records[id].medicationId = 'other-account-med';
  check(
    'Invalid check-ins rejected atomically',
    (await rpc(a, 'reminduh_save', { expected_revision: 2, payload: corrupt })).response.status >=
      400,
  );
  check(
    'Failed transaction preserves revision',
    (await rpc(a, 'reminduh_read')).data.revision === 2,
  );
  delete data.records[id];
  check(
    'Undo sync removes old check-in',
    Object.keys(
      (await rpc(a, 'reminduh_save', { expected_revision: 2, payload: data })).data.data.records,
    ).length === 0,
  );
  check(
    'Deletion rejects another account’s proof',
    (await rpc(a, 'reminduh_delete_account', { confirmation_token: b.confirmationToken })).response
      .status >= 400,
  );
  const deleted = await rpc(a, 'reminduh_delete_account', {
    confirmation_token: a.confirmationToken,
  });
  if (!deleted.response.ok) console.log('Delete error:', deleted.response.status, deleted.data);
  check('Reauthenticated account deletion works', deleted.data?.deleted === true);
  const rows = await pool.query(
    'SELECT count(*)::int AS count FROM public.reminduh_accounts WHERE user_id=$1',
    [a.id],
  );
  check('Deletion removes medication account data', rows.rows[0].count === 0);
  const oldJwt = await fetch(api + '/rpc/reminduh_read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: '{}',
  });
  check('Deleted account’s still-unexpired JWT is rejected', oldJwt.status >= 400);
  check('Other account survives deletion', (await rpc(b, 'reminduh_read')).response.ok);
  await writeFile(
    new URL('integration.json', out),
    JSON.stringify(
      { checks, count: checks.length, branch: 'development', checkedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
  console.log(`${checks.length} live auth/database checks passed.`);
} finally {
  await pool.end();
}
