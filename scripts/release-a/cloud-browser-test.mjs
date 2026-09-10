import { randomUUID, createHash } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import pg from 'pg';
const origin = 'http://127.0.0.1:5189';
const auth = 'https://ep-lucky-flower-zawfn6wc.neonauth.c-2.eu-west-2.aws.neon.tech/reminduh/auth';
const api = 'https://ep-lucky-flower-zawfn6wc.apirest.c-2.eu-west-2.aws.neon.tech/reminduh/rest/v1';
const out = 'rebuild/generated/release-a/cloud';
await mkdir(out, { recursive: true });
const env = await readFile('/tmp/reminduh-release-a-validation.env', 'utf8');
if (!env.includes('ep-lucky-flower-zawfn6wc'))
  throw new Error('Browser tests require the isolated development branch.');
const pool = new pg.Pool({
  connectionString: env
    .split('\n')
    .find((l) => l.startsWith('DATABASE_URL='))
    ?.slice(13),
  max: 1,
});
const { b } = JSON.parse(await readFile(out + '/private/accounts.json', 'utf8'));
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist'] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const checks = [];
const done = (name) => {
  checks.push(name);
  console.log('Passed:', name);
};

try {
  assert(/^reminduh-integration-\d+-b@example\.invalid$/.test(b.email));
  await pool.query('DELETE FROM public.reminduh_accounts WHERE user_id=$1', [b.id]);
  // Avoid delivering an email to a reserved synthetic address; install only a
  // deterministic OTP fixture, then exercise the real sign-in endpoint.
  const mailFixture = async (route) => {
    const { email } = route.request().postDataJSON();
    assert.equal(email, b.email);
    await pool.query('DELETE FROM neon_auth.verification WHERE identifier=$1', [
      'sign-in-otp-' + email,
    ]);
    await pool.query(
      'INSERT INTO neon_auth.verification(id,identifier,value,"expiresAt","createdAt","updatedAt") VALUES($1,$2,$3,now()+interval \'5 minutes\',now(),now())',
      [
        randomUUID(),
        'sign-in-otp-' + email,
        createHash('sha256').update('482917').digest('base64url') + ':0',
      ],
    );
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"success":true}',
      headers: {
        'access-control-allow-origin': origin,
        'access-control-allow-credentials': 'true',
      },
    });
  };
  await context.route(auth + '/email-otp/send-verification-otp', mailFixture);
  await page.goto(origin + '/account');
  await expect(page.getByRole('heading', { name: 'Your routine, wherever you are' })).toBeVisible();
  await page.getByLabel('Email address').fill(b.email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByLabel('Email code')).toBeVisible();
  await page.getByLabel('Email code').fill('000000');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('code could not be checked');
  done('Incorrect email code produces an accessible error');
  await page.getByLabel('Email code').fill('482917');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Turn on cloud sync?' })).toBeVisible({
    timeout: 20000,
  });
  done('Real email-code verification adopts a verified session');
  await page.screenshot({ path: out + '/account-sync-choice.png', fullPage: true });
  await page.getByRole('button', { name: 'Turn on cloud sync', exact: true }).click();
  await page.waitForURL('**/welcome');
  await page.getByLabel('What should we call you?').fill('Browser tester');
  await page.getByLabel('Your companion’s name').fill('Cloudy');
  await page.getByRole('button', { name: 'Make yourself at home' }).click();
  await page.getByLabel('Medication name', { exact: true }).fill('Sample cloud medication');
  await page.getByLabel('Strength per tablet (mg)', { exact: true }).fill('10');
  await page.getByLabel('Number of tablets per dose', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Add medication', exact: true }).click();
  await page.goto(origin + '/account');
  await expect(page.getByText('Up to date', { exact: true })).toBeVisible({ timeout: 20000 });
  done('Guest setup and medication persist to the account');
  await page.evaluate(async () => {
    const store = window.__appStore.getState();
    const { dateKey } = await import('/src/domain/schedule.ts');
    store.saveRoutine({
      title: 'Cloud quiet break',
      category: 'rest',
      activity: 'sand',
      days: [0, 1, 2, 3, 4, 5, 6],
      startDate: dateKey(),
    });
    const r = window.__appStore.getState().data.selfCare.routines[0];
    window.__appStore.getState().recordRoutine(r.id + '@' + dateKey(), 'skipped');
  });
  await expect
    .poll(
      async () =>
        (
          await pool.query(
            "SELECT settings#>>'{selfCare,records}' AS records FROM public.reminduh_accounts WHERE user_id=$1",
            [b.id],
          )
        ).rows[0]?.records,
    )
    .toContain('skipped');
  done('Routine record, reward ledger and balance sync together');
  await page.reload();
  await expect(page.getByText('Up to date', { exact: true })).toBeVisible({ timeout: 20000 });
  done('HttpOnly browser session survives reload');
  const local = await page.evaluate(() => JSON.parse(localStorage.getItem('reminduh-mvp-v1')));
  assert(local._cloud.revision > 0);
  assert(!JSON.stringify(local).includes(b.password));
  done('Local sync metadata contains no authentication secrets');
  await context.setOffline(true);
  await page.evaluate(() => window.__appStore.getState().setProfile('Offline name', 'Cloudy'));
  await expect(
    page.getByText('Saved on this device · waiting to sync', { exact: true }),
  ).toBeVisible({ timeout: 5000 });
  await context.setOffline(false);
  await expect(page.getByText('Up to date', { exact: true })).toBeVisible({ timeout: 20000 });
  done('Offline changes sync after reconnection');
  // A second real cookie-authenticated browser restores the same account.
  const second = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const secondLogin = await fetch(auth + '/sign-in/email', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: b.email, password: b.password }),
  });
  assert.equal(secondLogin.status, 200);
  const cookiePair = secondLogin.headers.getSetCookie()[0].split(';')[0];
  await second.addCookies([
    {
      name: cookiePair.split('=')[0],
      value: cookiePair.slice(cookiePair.indexOf('=') + 1),
      domain: new URL(auth).hostname,
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'None',
    },
  ]);
  const other = await second.newPage();
  await other.goto(origin + '/account');
  await other.evaluate(async () => {
    const { getCloudSession } = await import('/src/cloud/auth.ts');
    const { receiveSignIn } = await import('/src/cloud/engine.ts');
    const session = await getCloudSession();
    await receiveSignIn(session.user);
  });
  await expect(other.getByRole('button', { name: 'Open my cloud copy' })).toBeVisible();
  await other.getByRole('button', { name: 'Open my cloud copy' }).click();
  await other.waitForURL(origin + '/');
  await other.goto(origin + '/account');
  await expect(other.getByText('Up to date', { exact: true })).toBeVisible({ timeout: 20000 });
  assert.equal(
    await other.evaluate(() => window.__appStore.getState().data.profile.name),
    'Offline name',
  );
  done('Second device restores cloud medication and profile');
  const remoteRoutine = await other.evaluate(() => window.__appStore.getState().data.selfCare);
  assert.equal(Object.values(remoteRoutine.records)[0].status, 'skipped');
  assert.equal(Object.values(remoteRoutine.rewards)[0].amount, 5);
  done('Second device restores routine records and anti-repeat reward history');
  await context.setOffline(true);
  await page.evaluate(() => window.__appStore.getState().setProfile('Local conflict', 'Cloudy'));
  await other.evaluate(() => window.__appStore.getState().setProfile('Remote conflict', 'Cloudy'));
  await expect(other.getByText('Up to date', { exact: true })).toBeVisible({ timeout: 20000 });
  // Wait for the remote payload itself, not an earlier status text.
  await expect
    .poll(async () => {
      const result = await pool.query(
        "SELECT settings#>>'{profile,name}' AS name FROM public.reminduh_accounts WHERE user_id=$1",
        [b.id],
      );
      return result.rows[0]?.name;
    })
    .toBe('Remote conflict');
  await context.setOffline(false);
  await expect(page.getByText('Your copies need a quick review', { exact: true })).toBeVisible({
    timeout: 20000,
  });
  assert.equal(
    await page.evaluate(() => window.__appStore.getState().data.profile.name),
    'Local conflict',
  );
  done('Concurrent offline edits prompt instead of silently overwriting');
  await page.getByLabel('I’ve reviewed the copies.').check();
  await page.getByRole('button', { name: 'Keep cloud copy' }).click();
  await expect(page.getByText('Up to date', { exact: true })).toBeVisible({ timeout: 20000 });
  assert.equal(
    await page.evaluate(() => window.__appStore.getState().data.profile.name),
    'Remote conflict',
  );
  done('Explicit conflict resolution safely adopts the chosen copy');
  await page.screenshot({ path: out + '/account-mobile.png', fullPage: true });
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  assert.deepEqual(
    audit.violations.map((v) => ({ id: v.id, help: v.help })),
    [],
  );
  done('Account page passes automated WCAG checks');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  done('Account controls fit a 390px screen');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL('**/welcome');
  assert.equal(await page.evaluate(() => window.__appStore.getState().data.medications.length), 0);
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem('reminduh-mvp-v1'))._cloud),
    undefined,
  );
  done('Sign-out removes account data and binding from the device');
  await other.goto(origin + '/account');
  await other.getByRole('button', { name: 'Sync now' }).click();
  await expect(other.getByText('Up to date', { exact: true })).toBeVisible({ timeout: 20000 });
  done('Sign-out on one device preserves another device and cloud data');
  await second.route(auth + '/email-otp/send-verification-otp', mailFixture);
  await other.getByRole('button', { name: 'Delete account', exact: true }).click();
  await other.getByLabel('Type DELETE to confirm').fill('DELETE');
  await other.getByRole('button', { name: 'Email me a code' }).click();
  await other.getByLabel('Email code').fill('482917');
  await other.getByRole('button', { name: 'Confirm and delete account' }).click();
  await other.waitForURL('**/welcome');
  const deletedRows = await pool.query(
    'SELECT count(*)::int AS count FROM neon_auth."user" WHERE id=$1',
    [b.id],
  );
  assert.equal(deletedRows.rows[0].count, 0);
  assert.equal(await other.evaluate(() => window.__appStore.getState().data.medications.length), 0);
  done('Account deletion verifies a fresh real OTP and removes identity and device data');
  await second.close();
  assert.deepEqual(errors, []);
  await writeFile(
    out + '/browser.json',
    JSON.stringify(
      {
        checks,
        count: checks.length,
        emailDelivery:
          'Delivery not tested: deterministic hashed OTP seeded only for the synthetic development account; OTP verification, sessions and all data requests are live',
        checkedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    checks.length +
      ' live cloud browser checks passed (email delivery replaced by a synthetic OTP fixture).',
  );
} catch (error) {
  console.error('Cloud browser step failed:', error.message);
  await page.screenshot({ path: out + '/browser-failure.png', fullPage: true }).catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
  await pool.end();
}
