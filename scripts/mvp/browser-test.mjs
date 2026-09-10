import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
const origin = process.env.MVP_TEST_URL ?? 'http://127.0.0.1:5177';
const production = process.env.MVP_PRODUCTION_URL ?? 'http://127.0.0.1:4177';
const out = path.resolve(process.env.MVP_TEST_OUT ?? 'rebuild/generated/qa-mvp');
await mkdir(out, { recursive: true });
const servers = [],
  checks = [];
async function ensureServer(url, command) {
  try {
    if ((await fetch(url)).ok) return;
  } catch {}
  const child = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      ...command,
      '--host',
      '127.0.0.1',
      '--port',
      new URL(url).port,
      '--strictPort',
    ],
    { stdio: 'ignore' },
  );
  servers.push(child);
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
  }
  throw new Error('Could not start test server: ' + url);
}
await ensureServer(origin, []);
await ensureServer(production, ['preview']);
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
  timezoneId: 'Europe/London',
  reducedMotion: 'no-preference',
});
const page = await context.newPage(),
  errors = [],
  remote = [];
context.on('page', (p) => p.on('pageerror', (e) => errors.push(String(e))));
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('request', (r) => {
  if (!r.url().startsWith(origin) && !r.url().startsWith('data:') && !r.url().startsWith('blob:'))
    remote.push(r.url());
});
await context.addInitScript(() => {
  window.__testNotifications = [];
  class FakeNotification {
    static permission = 'granted';
    static requestPermission() {
      return Promise.resolve('granted');
    }
    constructor(title, options) {
      window.__testNotifications.push({ title, options });
      setTimeout(() => this.onshow?.(), 0);
    }
    close() {}
  }
  Object.defineProperty(window, 'Notification', { value: FakeNotification, configurable: true });
});
await page.clock.setFixedTime(new Date('2026-09-05T08:30:00+01:00'));
const nav = (name) =>
  page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name, exact: true })
    .click();
const snapshot = (name) => page.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('reminduh-mvp-v1')));
const saveDownload = async (button, fileName) => {
  const waiting = page.waitForEvent('download');
  await button.click();
  const file = await waiting;
  const target = path.join(out, fileName);
  await file.saveAs(target);
  return target;
};
try {
  await page.goto(origin);
  await expect(
    page.getByRole('heading', { name: 'A little care. A little company.' }),
  ).toBeVisible();
  await snapshot('welcome-desktop');
  await page.getByLabel('What should we call you?').fill('Alex');
  await page.getByLabel('Your companion’s name').fill('Mochi');
  await page.getByRole('button', { name: 'Make yourself at home' }).click();
  await page.getByLabel('Medication name', { exact: true }).fill('Morning supplement');
  await expect(page.getByLabel('Strength per tablet (mg)', { exact: true })).toBeEmpty();
  await expect(page.getByLabel('Number of tablets per dose', { exact: true })).toBeEmpty();
  await page.getByLabel('Strength per tablet (mg)', { exact: true }).fill('10');
  await page.getByLabel('Number of tablets per dose', { exact: true }).fill('2');
  await page.getByLabel('Instructions', { exact: false }).fill('My own instructions');
  await page.getByRole('button', { name: 'Add another time' }).click();
  await page.getByLabel('Time 2', { exact: true }).fill('20:00');
  await page.getByLabel('Track remaining supply').check();
  await page.getByLabel('Scheduled doses remaining').fill('12');
  await page.getByRole('button', { name: 'Add medication', exact: true }).click();
  await page.waitForFunction(() => window.__assetCharacter && window.__assetScene);
  assert.equal((await stored()).medications[0].strengthMg, 10);
  assert.equal((await stored()).medications[0].tabletsPerDose, 2);
  await expect(page.locator('.dose-card').first()).toContainText('2 tablets · 10 mg per tablet');
  await expect(page.locator('.dose-card')).toHaveCount(2);
  await expect(page.locator('.streak-badge b')).toHaveText('0');
  checks.push('Fresh onboarding and multiple-time medication creation without fabricated data');
  await snapshot('home-desktop');

  await page.locator('.dose-card').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.dose-card').first()).toBeFocused();
  checks.push('Keyboard Escape closes check-in and restores focus');
  await page.locator('.dose-card').first().click();
  await page.getByLabel('Note').fill('With breakfast');
  await snapshot('check-in');
  await page.getByRole('button', { name: 'I’ve taken this dose' }).click();
  await expect(page.locator('.dose-card.taken')).toHaveCount(1);
  await expect(page.locator('.streak-badge b')).toHaveText('1');
  await page.locator('.dose-card.taken').click();
  await page.getByRole('button', { name: 'Save as taken' }).click();
  assert.equal(Object.keys((await stored()).records).length, 1);
  await nav('Medications');
  await expect(page.getByText('11 scheduled doses left')).toBeVisible();
  checks.push('Taken dose, note, duplicate confirmation and inventory decrement');
  await page.reload();
  await expect(page.getByText('11 scheduled doses left')).toBeVisible();
  await nav('Today');
  await expect(page.locator('.dose-card.taken')).toHaveCount(1);
  checks.push('Records and supply survive reload');

  await page.locator('.dose-card').nth(1).click();
  await expect(page.getByText(/scheduled for later today/)).toBeVisible();
  await page.getByRole('button', { name: 'Record a skip', exact: true }).click();
  await page.getByRole('button', { name: 'Record as skipped', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: "Today's recorded doses" })).toHaveAttribute(
    'aria-valuenow',
    '2',
  );
  await expect(page.locator('.streak-badge b')).toHaveText('1');
  checks.push('Explicit skip, future-today notice and one streak count per day');

  await nav('My Blobby');
  await page.getByRole('button', { name: /Rain or shine/ }).click();
  await page.getByLabel('Bonsai', { exact: true }).uncheck();
  await page.getByLabel('Reduce motion').check();
  await page.getByRole('button', { name: 'Enable browser reminders' }).click();
  await expect(page.getByText('Browser reminders on')).toBeVisible();
  assert.equal(await page.evaluate(() => window.__testNotifications.length), 0);
  await snapshot('profile-desktop');
  await nav('Today');
  await page.waitForFunction(
    () => window.__assetScene?.scene.getObjectByName('Bonsai')?.visible === false,
  );
  assert.equal((await stored()).outfit, 'raincoat');
  checks.push('Outfit, furniture and reduced-motion preferences reach the 3D scene');

  await page.locator('.dose-card.taken').click();
  await page.getByRole('button', { name: 'Remove this check-in' }).click();
  await expect.poll(async () => page.evaluate(() => window.__testNotifications.length)).toBe(1);
  await page.reload();
  await expect(page.locator('.dose-card')).toHaveCount(2);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.__testNotifications.length), 0);
  await page.locator('.dose-card').first().click();
  await page.getByRole('button', { name: 'Remind me in 10 minutes' }).click();
  await expect(page.locator('.dose-card').first()).toContainText('Snoozed');
  assert.equal(await page.evaluate(() => window.__testNotifications.length), 0);
  await page.clock.setFixedTime(new Date('2026-09-05T08:41:00+01:00'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(async () => page.evaluate(() => window.__testNotifications.length)).toBe(1);
  await page.locator('.dose-card').first().click();
  await page.getByRole('button', { name: 'I’ve taken this dose' }).click();
  checks.push(
    'Notification opt-in, durable deduplication, snooze and due-time delivery with mocked OS notification',
  );

  await nav('Medications');
  await page.getByRole('link', { name: 'Edit Morning supplement', exact: true }).click();
  await expect(page.getByLabel('Strength per tablet (mg)', { exact: true })).toHaveValue('10');
  await expect(page.getByLabel('Number of tablets per dose', { exact: true })).toHaveValue('2');
  await page.getByLabel('Strength per tablet (mg)', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByText('Enter the strength per tablet in mg as a number greater than zero.'),
  ).toBeVisible();
  assert.equal((await stored()).medications[0].strengthMg, 10);
  await page.getByLabel('Strength per tablet (mg)', { exact: true }).fill('12.5');
  await page.getByLabel('Number of tablets per dose', { exact: true }).fill('0.5');
  await snapshot('dose-fields-edit');
  await page.getByLabel('Time 1', { exact: true }).fill('09:00');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(/New times from/)).toBeVisible();
  await expect(page.getByText('0.5 tablets · 12.5 mg per tablet', { exact: true })).toBeVisible();
  await page.reload();
  assert.equal((await stored()).medications[0].strengthMg, 12.5);
  assert.equal((await stored()).medications[0].tabletsPerDose, 0.5);
  assert.equal(Object.values((await stored()).records)[0].strengthMg, 10);
  assert.equal(Object.values((await stored()).records)[0].tabletsPerDose, 2);
  checks.push(
    'Separate strength/tablet fields validate, retain decimals after reload and preserve recorded snapshots',
  );
  await nav('Today');
  await expect(page.locator('.dose-card')).toHaveCount(2);
  await expect(page.locator('.dose-card').first()).toContainText('8:00');
  checks.push('Schedule editing preserves today and starts new times tomorrow');
  await nav('Medications');
  await page.getByRole('button', { name: 'Pause Morning supplement', exact: true }).click();
  await expect(page.getByText('Paused', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume Morning supplement', exact: true }).click();
  await page.getByRole('button', { name: 'Archive Morning supplement' }).click();
  await page.getByRole('button', { name: /Archived/ }).click();
  await expect(page.getByRole('heading', { name: 'Morning supplement' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore Morning supplement', exact: true }).click();
  await page.getByRole('button', { name: /Your routine/ }).click();
  checks.push('Pause, resume, archive and restore preserve recorded history');

  await nav('History');
  await expect(page.locator('.day-detail .dose-card')).toHaveCount(2);
  await page.getByLabel('Filter medication').selectOption({ label: 'Morning supplement' });
  await expect(page.locator('.day-detail .dose-card')).toHaveCount(2);
  await snapshot('history-desktop');
  const csvPath = await saveDownload(
    page.getByRole('button', { name: 'Export CSV' }),
    'check-ins.csv',
  );
  assert.match(await readFile(csvPath, 'utf8'), /Morning supplement/);
  await nav('My Blobby');
  const calendarPath = await saveDownload(
    page.getByRole('button', { name: 'Export calendar reminders' }),
    'reminders.ics',
  );
  assert.match(await readFile(calendarPath, 'utf8'), /BEGIN:VALARM/);
  const backupPath = await saveDownload(
    page.getByRole('button', { name: 'Export backup', exact: true }),
    'backup.json',
  );
  const before = JSON.parse(await readFile(backupPath, 'utf8'));
  assert.equal(Object.keys(before.data.records).length, 2);
  await page.getByLabel('Choose a Reminduh backup').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":999}'),
  });
  await expect(page.getByRole('alert')).toContainText('supported Reminduh backup');
  assert.equal(Object.keys((await stored()).records).length, 2);
  checks.push('Calendar history, filter, CSV, calendar export and invalid-restore rejection');

  await page.getByRole('button', { name: 'Reset this device’s app data' }).click();
  await expect(page.getByRole('button', { name: 'Reset app data', exact: true })).toBeDisabled();
  await page.getByLabel('Type RESET to confirm').fill('RESET');
  await page.getByRole('button', { name: 'Reset app data', exact: true }).click();
  await expect(page).toHaveURL(/welcome/);
  await page.getByRole('link', { name: 'Already have a backup? Restore it' }).click();
  await page.getByLabel('Choose a Reminduh backup').setInputFiles(backupPath);
  await expect(page.getByRole('dialog')).toContainText('2 check-ins');
  await page.getByRole('button', { name: 'Replace with backup' }).click();
  await expect(page.locator('.dose-card')).toHaveCount(2);
  assert.equal((await stored()).preferences.reminders, false);
  checks.push('Explicit reset confirmation and full backup restoration');

  await page.clock.setFixedTime(new Date('2026-09-06T08:30:00+01:00'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.dose-card')).toHaveCount(2);
  await expect(page.getByRole('progressbar', { name: "Today's recorded doses" })).toHaveAttribute(
    'aria-valuenow',
    '0',
  );
  await expect(page.locator('.dose-card').first()).toContainText('9:00');
  await expect(page.locator('.streak-badge b')).toHaveText('1');
  await page.locator('.dose-card').first().click();
  await page.getByRole('button', { name: 'I’ve taken this dose' }).click();
  await expect(page.locator('.streak-badge b')).toHaveText('2');
  checks.push('Live local-midnight rollover and next-day schedule/streak');

  const second = await context.newPage();
  await second.goto(origin + '/profile');
  await second.getByLabel('Companion name', { exact: true }).fill('Pebble');
  await second.getByRole('button', { name: 'Save names' }).click();
  await expect(page.getByRole('heading', { name: 'Pebble', exact: true })).toBeVisible();
  await second.close();
  checks.push('Changes refresh across tabs on the same device');

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
    for (const [name, url] of [
      ['home', '/'],
      ['medications', '/meds'],
      ['history', '/log'],
      ['profile', '/profile'],
      ['medication-form', '/meds/new'],
    ]) {
      await page.goto(origin + url);
      if (name === 'home') {
        await page.waitForSelector('[data-scene-ready="true"]');
        const pixels = await sharp(await page.locator('.home-scene').screenshot()).stats();
        assert.ok(
          pixels.channels.slice(0, 3).some((channel) => channel.stdev > 10),
          'The reduced-motion scene visibly rendered at ' + width + 'px',
        );
      }
      await page.waitForTimeout(100);
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        name + ' fits ' + width + 'px',
      );
      if (width === 390 || width === 1440) await snapshot(name + '-' + width);
    }
  }
  checks.push('All product screens fit mobile, tablet and desktop widths');
  await page.goto(origin + '/profile');
  await page.getByLabel('Use a still image').check();
  await nav('Today');
  await expect(page.locator('.home-scene canvas')).toHaveCount(0);
  await expect(page.locator('.home-scene img')).toBeVisible();
  checks.push('Still-image mode works without a WebGL scene');

  const offlineContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: 'Europe/London',
  });
  const offline = await offlineContext.newPage();
  const offlineErrors = [];
  offline.on('pageerror', (e) => offlineErrors.push(String(e)));
  await offline.goto(production + '/welcome');
  await offline.waitForFunction(() => navigator.serviceWorker.controller, { timeout: 45000 });
  await offline.getByRole('button', { name: 'Make yourself at home' }).click();
  await offline.getByLabel('Medication name', { exact: true }).fill('Offline test medication');
  await offline.getByLabel('Strength per tablet (mg)', { exact: true }).fill('10');
  await offline.getByLabel('Number of tablets per dose', { exact: true }).fill('1');
  await offline.getByRole('button', { name: 'Add medication', exact: true }).click();
  await offline.waitForSelector('[data-scene-ready="true"]');
  await offlineContext.setOffline(true);
  await offline.reload();
  await expect(offline.locator('.dose-card')).toHaveCount(1);
  await offline.locator('.dose-card').click();
  await offline.getByRole('button', { name: 'I’ve taken this dose' }).click();
  await offline.reload();
  await expect(offline.locator('.dose-card.taken')).toHaveCount(1);
  await offline.getByRole('button', { name: /^Feed \d/ }).click();
  await offline.getByRole('button', { name: 'Select Apple, 3 available', exact: true }).click();
  await offline.getByRole('button', { name: 'Feed Apple', exact: true }).click();
  await expect(offline.getByRole('region', { name: 'Your companion' })).toHaveAttribute(
    'data-state',
    'feeding',
  );
  await offline.reload();
  await expect(offline.locator('.treat-count')).toHaveText('4');
  assert.equal(
    await offline.evaluate(() => JSON.parse(localStorage.getItem('reminduh-mvp-v1')).care.xp),
    10,
  );
  await offline.getByRole('link', { name: 'Shop', exact: true }).click();
  await offline.getByRole('button', { name: /Preview Cookie/ }).click();
  await offline.getByRole('button', { name: 'Buy for 21 leaves', exact: true }).click();
  await offline
    .getByRole('dialog')
    .getByRole('button', { name: 'Buy for 21 leaves', exact: true })
    .click();
  await offline.reload();
  await expect(
    offline.getByRole('button', { name: 'Preview Cookie, 3 in pantry', exact: true }),
  ).toBeVisible();
  assert.equal(
    await offline.evaluate(() => JSON.parse(localStorage.getItem('reminduh-mvp-v1')).market.coins),
    99,
  );
  await offline.getByRole('navigation').getByRole('link', { name: 'History', exact: true }).click();
  await expect(offline.locator('.day-detail .dose-card.taken')).toHaveCount(1);
  await offline.screenshot({ path: path.join(out, 'offline-mobile.png'), fullPage: true });
  assert.deepEqual(offlineErrors, []);
  await offlineContext.close();
  checks.push(
    'Production service worker caches app/assets; offline reload, recording, feeding, shop purchases, inventory, friendship and history work',
  );

  assert.deepEqual(remote, [], 'No remote network dependencies');
  assert.deepEqual(errors, [], 'No browser errors');
  await writeFile(
    path.join(out, 'browser-results.json'),
    JSON.stringify(
      { status: 'passed', count: checks.length, checks, remoteRequests: remote, errors },
      null,
      2,
    ),
  );
  console.log(checks.length + ' browser scenarios passed, including offline production flow.');
} catch (error) {
  await snapshot('failure').catch(() => {});
  console.error('Completed scenarios:', checks);
  console.error('Browser errors:', errors);
  throw error;
} finally {
  await browser.close();
  for (const child of servers) child.kill('SIGTERM');
}
