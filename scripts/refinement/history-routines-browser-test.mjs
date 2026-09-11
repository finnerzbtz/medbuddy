import { chromium, webkit, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

// Isolate all synthetic medication/routine edits from the user's app origin.
const socket = createServer();
await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const base = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  {
    env: { ...process.env, VITE_NEON_AUTH_URL: '', VITE_NEON_DATA_URL: '' },
    stdio: 'ignore',
  },
);
const serverClosed = once(server, 'exit');
const output = 'rebuild/generated/refinement';
const results = [];
const fixture = JSON.parse(await readFile('scripts/release-a/fixtures/v1.json', 'utf8'));
fixture.preferences.staticScene = true;
fixture.preferences.showWisdom = false;
fixture.preferences.hideRewards = true;
fixture.medications.push({
  ...structuredClone(fixture.medications[0]),
  id: 'second-med',
  name: 'Second fixture medication',
});
const storage = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('reminduh-mvp-v1')));
const health = (data) => ({
  medications: data.medications,
  records: data.records,
  reminders: data.reminders,
  care: data.care,
});
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error('Isolated preview stopped');
    try {
      ready = (await fetch(base)).ok;
    } catch {}
    if (ready) break;
    await delay(100);
  }
  if (!ready) throw new Error('Isolated preview did not start');
  await mkdir(output, { recursive: true });
  for (const [engine, browserType] of [
    ['chromium', chromium],
    ['webkit', webkit],
  ]) {
    const browser = await browserType.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.clock.setFixedTime(new Date('2026-09-10T12:00:00Z'));
      await page.goto(base + '/log');
      await page.evaluate(
        (data) => localStorage.setItem('reminduh-mvp-v1', JSON.stringify(data)),
        fixture,
      );
      await page.reload();
      const dates = page.getByRole('button', { name: /^Choose date,/ });
      const records = page.getByRole('region', { name: 'Medication history', exact: true });
      await expect(page.locator('#history-calendar')).not.toBeVisible();
      await expect(records.locator('.dose-card').first()).toBeInViewport();
      expect((await records.locator('.dose-card').first().boundingBox()).y).toBeLessThan(500);
      await expect(page.getByRole('button', { name: 'Next day', exact: true })).toBeDisabled();
      await page.screenshot({ path: `${output}/history-${engine}-390.png`, fullPage: true });
      await page.getByRole('button', { name: 'Previous day', exact: true }).click();
      await expect(dates).toHaveAccessibleName(/9/);
      await page.getByRole('button', { name: 'Next day', exact: true }).click();
      await expect(dates).toContainText('Today');
      await dates.focus();
      await page.keyboard.press('Enter');
      await expect(dates).toHaveAttribute('aria-expanded', 'true');
      await page.locator('[data-calendar-day="2026-09-10"]').focus();
      await page.keyboard.press('ArrowLeft');
      await expect(page.locator('[data-calendar-day="2026-09-09"]')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('#history-calendar')).not.toBeVisible();
      await expect(dates).toBeFocused();
      await dates.click();
      for (let month = 0; month < 12; month++)
        await page.getByRole('button', { name: 'Previous month', exact: true }).click();
      await page.locator('[data-calendar-day="2025-09-09"]').click();
      await expect(dates).toHaveAccessibleName(/2025/);
      await expect(dates).toContainText('2025');
      await expect(page.locator('#history-calendar')).not.toBeVisible();
      await dates.click();
      await page.getByRole('button', { name: 'Back to today', exact: true }).click();
      await expect(dates).toHaveAccessibleName(/2026/);
      await expect(dates).toContainText('Today');
      await dates.click();
      await page.locator('[data-calendar-day="2026-09-02"]').click();
      await records.locator('.dose-card').filter({ hasText: 'Taken' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('heading', { name: 'Update this check-in' })).toBeVisible();
      await dialog.getByLabel('Note (optional)').fill('History refinement fixture note');
      await dialog.getByRole('button', { name: 'Save as taken' }).click();
      await expect(records).toContainText('History refinement fixture note');
      await records.locator('.history-filter-options > summary').focus();
      await page.keyboard.press('Enter');
      await page.getByLabel('Filter medication').selectOption('second-med');
      await expect(records.locator('.dose-card')).toHaveCount(1);
      await expect(records.locator('.dose-card')).toContainText('Second fixture medication');
      await page.getByLabel('Filter medication').selectOption('');
      await expect(records.locator('.dose-card')).toHaveCount(2);
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe('reminduh-check-ins-2026-09-10.csv');
      expect(await readFile(await download.path(), 'utf8')).toContain(
        'History refinement fixture note',
      );
      await page.locator('.history-summary > summary').focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('.history-stats')).toBeVisible();
      await dates.click();
      await page.getByRole('button', { name: 'Back to today', exact: true }).click();
      const beforeRoutines = health(await storage(page));
      await page.goto(base + '/routines');
      await expect(page.getByRole('heading', { name: 'Start with an idea' })).toHaveCount(1);
      await expect(page.getByRole('heading', { name: 'Add a routine', exact: true })).toHaveCount(
        0,
      );
      await page.getByRole('button', { name: 'Rest Take a quiet break' }).focus();
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: 'Add routine', exact: true }).click();
      await expect(
        page.getByRole('article', { name: 'Take a quiet break', exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Your routines', exact: true })).toBeFocused();
      await expect(page.getByRole('button', { name: 'Create your own routine' })).not.toBeVisible();
      await page.screenshot({ path: `${output}/routines-${engine}-390.png`, fullPage: true });
      await page.locator('.routine-add-options > summary').focus();
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: 'Create your own routine' }).click();
      await page.getByLabel('Routine name').fill('A second quiet moment');
      await page.getByRole('button', { name: 'Add routine', exact: true }).click();
      expect(health(await storage(page))).toEqual(beforeRoutines);
      await page.goto(base + '/log');
      await expect(page.getByRole('region', { name: 'Optional routine history' })).toContainText(
        'Self-care',
      );
      await expect(records).not.toContainText('A second quiet moment');
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        for (const route of ['/log', '/routines']) {
          await page.goto(base + route);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
          ).toBe(true);
          if (route === '/log') {
            await expect(records.locator('.dose-card').first()).toBeInViewport();
            await dates.click();
          } else {
            await page.locator('.routine-add-options > summary').click();
          }
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
          ).toBe(true);
          const audit = await new AxeBuilder({ page })
            .include('.calm-page')
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze();
          expect(audit.violations).toEqual([]);
          await page.addStyleTag({ content: 'html{font-size:200%!important}' });
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2),
          ).toBe(true);
        }
      }
      expect(errors).toEqual([]);
      results.push(
        `${engine}: records lead, day/calendar keyboard and focus, unambiguous cross-year dates, edit/filter/export, summary, empty/populated routines, medication isolation, separate history, 320/390px and 200% text, axe`,
      );
      console.log('✓ ' + results.at(-1));
    } finally {
      await browser.close();
    }
  }
  await writeFile(
    `${output}/history-routines-results.json`,
    JSON.stringify({ passed: true, results }, null, 2),
  );
} finally {
  server.kill('SIGTERM');
  await serverClosed;
}
