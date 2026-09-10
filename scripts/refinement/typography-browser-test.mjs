import { chromium, webkit, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

const socket = createServer();
await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const base = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { env: { ...process.env, VITE_NEON_AUTH_URL: '', VITE_NEON_DATA_URL: '' }, stdio: 'ignore' },
);
const serverClosed = once(server, 'exit');
const output = 'rebuild/generated/refinement/typography';
await mkdir(output, { recursive: true });
const fixture = JSON.parse(await readFile('scripts/release-a/fixtures/v1.json', 'utf8'));
fixture.preferences.staticScene = true;
fixture.preferences.showWisdom = true;
fixture.voice = 'quiet';
fixture.profile.name = 'Alex';
const routes = [
  '/',
  '/meds',
  '/meds/new',
  '/log',
  '/routines',
  '/profile#sound',
  '/profile#accessibility',
  '/shop',
  '/music',
  '/help',
];
const results = [];
const failures = [];
const overflow = (page) =>
  page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    targets: [...document.querySelectorAll('body *')]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return (
          r.width > 0 &&
          r.height > 0 &&
          getComputedStyle(e).visibility !== 'hidden' &&
          (r.right > innerWidth + 2 || r.left < -2) &&
          !e.closest('[aria-hidden="true"],.live-scene,.visually-hidden,.skip-link')
        );
      })
      .slice(0, 12)
      .map((e) => ({
        tag: e.tagName,
        class: e.className,
        text: e.textContent.trim().slice(0, 70),
        left: e.getBoundingClientRect().left,
        right: e.getBoundingClientRect().right,
      })),
  }));
const samples = (page) =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll(
        'h1,h2,h3,label,.wisdom-message p,.wisdom-message figcaption,button,.nav-item span,.page-heading .eyebrow,summary,.dose-copy strong',
      ),
    ]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return (
          r.width > 0 && r.height > 0 && e.textContent.trim() && !e.closest('[aria-hidden="true"]')
        );
      })
      .map((e) => ({
        tag: e.tagName,
        text: e.textContent.trim().replace(/\s+/g, ' ').slice(0, 80),
        font: parseFloat(getComputedStyle(e).fontSize),
      })),
  );
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      ready = (await fetch(base)).ok;
    } catch {}
    if (ready) break;
    await delay(100);
  }
  if (!ready) throw Error('Isolated typography preview did not start');
  for (const [engine, type] of Object.entries({ chromium, webkit })) {
    const browser = await type.launch({ headless: true });
    try {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.clock.setFixedTime(new Date('2026-09-10T12:00:00Z'));
      await page.goto(base + '/profile');
      await page.waitForFunction(() => window.__appStore);
      await page.evaluate(
        (d) => localStorage.setItem('reminduh-mvp-v1', JSON.stringify(d)),
        fixture,
      );
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        for (const route of routes) {
          await page.goto(base + route);
          await page.locator('main h1').waitFor();
          await page.evaluate(() => document.documentElement.style.removeProperty('font-size'));
          await delay(120);
          const normal = await samples(page);
          await page.evaluate(() =>
            document.documentElement.style.setProperty('font-size', '200%', 'important'),
          );
          const large = await samples(page);
          const unchanged = large.filter(
            (x, i) => normal[i] && x.text === normal[i].text && x.font < normal[i].font * 1.95,
          );
          if (route === '/') {
            const badgeFits = await page
              .locator('.companion-actions .treat-count')
              .evaluate((badge) => {
                const range = document.createRange();
                range.selectNodeContents(badge);
                const text = range.getBoundingClientRect(),
                  box = badge.getBoundingClientRect();
                return (
                  text.top >= box.top - 1 &&
                  text.bottom <= box.bottom + 1 &&
                  text.right <= box.right + 1
                );
              });
            if (!badgeFits)
              failures.push({ engine, width, route, reason: 'Feed count text exceeds badge' });
          }
          const geometry = await overflow(page);
          const entry = { engine, width, route, normal, large, geometry };
          results.push(entry);
          if (unchanged.length)
            failures.push({
              engine,
              width,
              route,
              reason: 'Meaningful text did not double',
              unchanged,
            });
          if (geometry.scrollWidth > width + 2)
            failures.push({ engine, width, route, reason: 'Horizontal page overflow', geometry });
          await page.screenshot({
            path: `${output}/${engine}-${width}-${route.replace(/[^a-z]+/g, '-') || 'home'}-large.png`,
            fullPage: true,
          });
          if (route === '/meds/new' && width === 320) {
            const [cancel, save] = await page.locator('.form-actions > .button').all();
            const cancelBox = await cancel.boundingBox();
            const saveBox = await save.boundingBox();
            expect(saveBox.y).toBeGreaterThanOrEqual(cancelBox.y + cancelBox.height);
          }
          if (route === '/' && width === 320) {
            const health = () =>
              page.evaluate(() => {
                const d = window.__appStore.getState().data;
                return JSON.stringify([d.medications, d.records, d.reminders]);
              });
            const before = await health();
            await page.getByRole('button', { name: 'Room options', exact: true }).click();
            const tools = page.locator('#room-tools');
            await expect(tools).toBeVisible();
            expect(await tools.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
            await tools.getByRole('button').first().focus();
            await page.keyboard.press('Escape');
            await expect(
              page.getByRole('button', { name: 'Room options', exact: true }),
            ).toBeFocused();
            await page.getByRole('button', { name: 'Activities', exact: true }).click();
            const activities = page.locator('#room-activities');
            await expect(activities.getByRole('button')).toHaveCount(4);
            expect(await activities.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
            await page.getByRole('button', { name: 'Activities', exact: true }).click();
            await page.locator('.dose-card').first().click();
            const dialog = page.getByRole('dialog');
            await expect(dialog).toBeVisible();
            expect(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
            await page.screenshot({
              path: `${output}/${engine}-320-check-in-large.png`,
              fullPage: true,
            });
            await page.getByRole('button', { name: 'Close check-in', exact: true }).click();
            expect(await health()).toBe(before);
          }
          // Every fixed navigation label remains on-screen and can be focused at enlarged size.
          for (const item of await page.locator('.app-navigation .nav-item').all()) {
            const r = await item.boundingBox();
            if (r && (r.x < -1 || r.x + r.width > width + 1))
              failures.push({
                engine,
                width,
                route,
                reason: 'Navigation exceeds viewport',
                label: await item.innerText(),
                r,
              });
          }
        }
      }
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  }
  await writeFile(
    `${output}/results.json`,
    JSON.stringify({ passed: !failures.length, results, failures }, null, 2),
  );
  console.log(JSON.stringify({ pages: results.length, failures }, null, 2));
  expect(failures).toEqual([]);
} finally {
  server.kill('SIGTERM');
  await serverClosed;
}
