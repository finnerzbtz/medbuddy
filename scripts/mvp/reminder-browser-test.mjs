import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const origin = process.env.MVP_TEST_URL ?? 'http://127.0.0.1:5177';
const out = process.env.REMINDER_TEST_OUT ?? 'rebuild/generated/qa-reminders';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
const checks = [],
  errors = [];
const fixture = (enabled = false) => ({
  schemaVersion: 1,
  onboarded: true,
  profile: { name: 'Alex', petName: 'Blobby' },
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
      schedules: [
        {
          from: '2026-09-05',
          times: ['08:00', '20:00'],
          days: [0, 1, 2, 3, 4, 5, 6],
          active: true,
        },
      ],
      stock: null,
      refillAt: 5,
    },
  ],
  records: {},
  outfit: 'base',
  hiddenGroups: [],
  preferences: { reducedMotion: true, staticScene: true, reminders: enabled },
  reminders: {},
  updatedAt: '2026-09-05T07:00:00Z',
});
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('reminduh-mvp-v1')));
const wake = (p) => p.evaluate(() => window.dispatchEvent(new Event('focus')));
let contexts = [];
async function setup({
  enabled = false,
  permission = 'granted',
  mode = 'success',
  now = '2026-09-05T09:00:00+01:00',
  seed = fixture(enabled),
} = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    timezoneId: 'Europe/London',
    locale: 'en-GB',
  });
  contexts.push(context);
  const deliveries = [];
  await context.exposeBinding('__reportNotification', (_, detail) => deliveries.push(detail));
  await context.addInitScript(
    ({ seed, permission, mode }) => {
      if (!localStorage.getItem('reminduh-mvp-v1'))
        localStorage.setItem('reminduh-mvp-v1', JSON.stringify(seed));
      window.__mode = mode;
      window.__attempts = [];
      window.__pending = [];
      window.__requests = 0;
      class FakeNotification {
        static permission = permission;
        static async requestPermission() {
          window.__requests++;
          return this.permission;
        }
        constructor(title, options) {
          window.__attempts.push({ title, options });
          const done = () => {
            if (window.__mode === 'fail') this.onerror?.();
            else {
              void window.__reportNotification({ title, options });
              this.onshow?.();
            }
          };
          if (window.__mode === 'wait') window.__pending.push(done);
          else setTimeout(done, 0);
        }
        close() {}
      }
      if (permission === 'unsupported') delete window.Notification;
      else
        Object.defineProperty(window, 'Notification', {
          value: FakeNotification,
          configurable: true,
        });
    },
    { seed, permission, mode },
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.clock.setFixedTime(new Date(now));
  await page.goto(origin + '/profile#reminders');
  return { context, page, deliveries };
}
const attempts = (page) => page.evaluate(() => window.__attempts.length);
try {
  {
    const { page, deliveries } = await setup({ now: '2026-09-05T07:00:00+01:00' });
    await expect(page.locator('.reminder-status')).toHaveText('Off');
    assert.equal(await page.evaluate(() => window.__requests), 0);
    await page.getByRole('button', { name: 'Enable browser reminders', exact: true }).click();
    await expect(page.locator('.reminder-status')).toHaveText('On');
    await expect(page.locator('.reminder-next')).toContainText('8:00');
    const before = await stored(page);
    await page.getByRole('button', { name: 'Test notification', exact: true }).click();
    await expect(page.getByText(/Test sent/)).toBeVisible();
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].options.tag, 'reminduh-test');
    assert.deepEqual(await stored(page), before);
    await page.getByRole('button', { name: 'Turn off reminders', exact: true }).click();
    await page.clock.setFixedTime(new Date('2026-09-05T09:00:00+01:00'));
    await wake(page);
    assert.equal((await stored(page)).preferences.reminders, false);
    await page.waitForTimeout(80);
    assert.equal(deliveries.length, 1);
    checks.push(
      'Explicit opt-in, accurate next alert, private test delivery with no data changes, and off means no delivery',
    );
  }
  {
    const { page, deliveries } = await setup({ enabled: true });
    await expect.poll(() => deliveries.length).toBe(1);
    const sent = await stored(page);
    assert.ok(Object.values(sent.reminders)[0].notifiedAt);
    assert.ok(!JSON.stringify(deliveries).includes('Private medicine'));
    assert.deepEqual(sent.records, {});
    await page.reload();
    await page.waitForTimeout(100);
    assert.equal(deliveries.length, 1);
    checks.push(
      'Due reminders preserve medication privacy, never record ingestion, and stay deduplicated after reload',
    );
  }
  {
    const { page, deliveries } = await setup({ enabled: true, mode: 'fail' });
    await expect(page.locator('.reminder-status')).toHaveText('Needs attention');
    assert.deepEqual((await stored(page)).reminders, {});
    await wake(page);
    await page.waitForTimeout(80);
    assert.equal(await attempts(page), 1);
    await page.evaluate(() => {
      window.__mode = 'success';
    });
    await page.clock.setFixedTime(new Date('2026-09-05T09:01:01+01:00'));
    await wake(page);
    await expect.poll(() => deliveries.length).toBe(1);
    await expect(page.locator('.reminder-status')).toHaveText('On');
    assert.ok(Object.values((await stored(page)).reminders)[0].notifiedAt);
    checks.push(
      'An asynchronous OS failure remains unsent, backs off quietly, then retries successfully',
    );
  }
  {
    const { page, deliveries } = await setup({ enabled: true, mode: 'wait' });
    await expect.poll(() => attempts(page)).toBe(1);
    await page.goto(origin + '/');
    // Reload would abort the held constructor, so hold the new attempt on this document.
    await expect.poll(() => attempts(page)).toBe(1);
    await page.locator('.dose-card').first().click();
    await page.getByRole('button', { name: 'Remind me in 10 minutes', exact: true }).click();
    await page.evaluate(() => {
      window.__mode = 'success';
      window.__pending.shift()();
    });
    await expect.poll(() => deliveries.length).toBe(1);
    const snoozed = await stored(page),
      reminder = Object.values(snoozed.reminders)[0];
    assert.ok(reminder.snoozedUntil);
    assert.equal(reminder.notifiedAt, undefined);
    await expect(page.locator('.dose-card').first()).toContainText('Snoozed');
    await page.clock.setFixedTime(new Date('2026-09-05T09:10:01+01:00'));
    await wake(page);
    await expect.poll(() => deliveries.length).toBe(2);
    checks.push(
      'A snooze made during notification delivery wins over the old acknowledgement and delivers at its own time',
    );
  }
  {
    const seed = fixture(true);
    seed.reminders['reminder-med@2026-09-05@20:00'] = { snoozedUntil: '2026-09-06T00:10:00+01:00' };
    const { page, deliveries } = await setup({ seed, now: '2026-09-06T00:05:00+01:00' });
    assert.equal(deliveries.length, 0);
    await expect(page.locator('.reminder-next')).toContainText('0:10');
    await page.clock.setFixedTime(new Date('2026-09-06T00:10:01+01:00'));
    await wake(page);
    await expect.poll(() => deliveries.length).toBe(1);
    assert.ok((await stored(page)).reminders['reminder-med@2026-09-05@20:00'].notifiedAt);
    checks.push('A snooze made before midnight is delivered the following day');
  }
  {
    const { context, page, deliveries } = await setup({
      enabled: true,
      now: '2026-09-05T07:59:00+01:00',
    });
    const second = await context.newPage();
    await second.clock.setFixedTime(new Date('2026-09-05T07:59:00+01:00'));
    await second.goto(origin);
    await Promise.all(
      [page, second].map(async (p) => {
        await p.clock.setFixedTime(new Date('2026-09-05T08:00:01+01:00'));
        await wake(p);
      }),
    );
    await expect.poll(() => deliveries.length).toBe(1);
    await Promise.all([wake(page), wake(second)]);
    await page.waitForTimeout(120);
    assert.equal(deliveries.length, 1);
    checks.push(
      'Two tabs becoming due together produce one notification through a shared browser lock',
    );
  }
  for (const permission of ['denied', 'unsupported']) {
    const { page, deliveries } = await setup({ permission, enabled: true });
    await expect(page.locator('.reminder-status')).toHaveText(
      permission === 'denied' ? 'Blocked' : 'Unavailable',
    );
    await expect(
      page.getByRole('button', { name: 'Enable browser reminders', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Export calendar reminders', exact: true }),
    ).toBeEnabled();
    assert.equal(deliveries.length, 0);
    await page.getByRole('button', { name: 'Turn off reminders', exact: true }).click();
    assert.equal((await stored(page)).preferences.reminders, false);
    checks.push(
      permission === 'denied'
        ? 'Blocked permissions show recovery instructions and allow switching off'
        : 'Unsupported browsers offer calendar export without a permission prompt',
    );
  }
  {
    const { page } = await setup({ enabled: true, now: '2026-09-05T07:00:00+01:00' });
    await page.evaluate(() => {
      Notification.permission = 'denied';
    });
    await wake(page);
    await expect(page.locator('.reminder-status')).toHaveText('Blocked');
    await page.evaluate(() => {
      Notification.permission = 'granted';
    });
    await wake(page);
    await expect(page.locator('.reminder-status')).toHaveText('On');
    checks.push('Reminder status refreshes when browser permissions change outside the app');
  }
  {
    const { page } = await setup();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export calendar reminders', exact: true }).click();
    const download = await downloadPromise;
    await download.saveAs(path.join(out, 'reminders.ics'));
    await page.goto(origin);
    await page.locator('.dose-card').first().click();
    await expect(page.getByText('Browser alerts are off.', { exact: false })).toBeVisible();
    await page.getByRole('link', { name: 'Set up reminders', exact: true }).click();
    await expect(page.locator('.reminder-settings')).toBeInViewport();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    checks.push(
      'Calendar export downloads and snoozing with alerts off provides a working setup link',
    );
  }
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(out, 'reminder-results.json'),
    JSON.stringify({ status: 'passed', count: checks.length, checks, errors }, null, 2),
  );
  console.log(checks.length + ' reminder scenarios passed.');
} catch (error) {
  for (const [i, c] of contexts.entries())
    for (const p of c.pages())
      await p.screenshot({ path: path.join(out, 'failure-' + i + '.png') }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
