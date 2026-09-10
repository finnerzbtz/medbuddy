import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const out = 'rebuild/generated/qa-room-shop';
const audioManifest = JSON.parse(
  await readFile('rebuild/generated/audio/manifest.json', 'utf8').catch(() => '{}'),
);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
const errors = [],
  checks = [];
try {
  const seedContext = await browser.newContext(),
    seed = await seedContext.newPage();
  await seed.goto(process.env.MVP_TEST_URL ?? 'http://127.0.0.1:5177');
  await seed.waitForFunction(() => window.__appStore);
  const saved = await seed.evaluate(() => {
    window.__appStore.getState().completeWelcome('Alex', 'Blobby');
    const d = structuredClone(window.__appStore.getState().data);
    d.market.ownedRoomItems.push('sand_garden', 'record_player', 'lava_lamp', 'coast_view');
    d.room = {
      garden: 'sand_garden',
      table: 'record_player',
      lamp: 'lava_lamp',
      view: 'coast_view',
    };
    return JSON.stringify(d);
  });
  await seedContext.close();
  const context = await browser.newContext({
    viewport: { width: 390, height: 900 },
    timezoneId: 'Europe/London',
  });
  await context.addInitScript(() => {
    window.__recordedSources = [];
    window.__mixers = [];
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor(...args) {
        super(...args);
        window.__mixers.push(this);
      }
      createBufferSource() {
        const source = super.createBufferSource();
        const start = source.start.bind(source);
        source.start = (...args) => {
          window.__recordedSources.push(source);
          return start(...args);
        };
        return source;
      }
    };
  });
  await context.addInitScript((saved) => {
    if (!localStorage.getItem('reminduh-mvp-v1')) localStorage.setItem('reminduh-mvp-v1', saved);
  }, saved);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(process.env.MVP_PRODUCTION_URL ?? 'http://127.0.0.1:4177');
  await page.waitForFunction(() => navigator.serviceWorker.controller, { timeout: 45000 });
  await page.waitForSelector('[data-scene-ready="true"]');
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names.find((n) => n.startsWith('reminduh-app-')));
    return !!(await cache.match('/assets-v2/room-collection.glb'));
  });
  assert.equal(cached, true);
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('[data-scene-ready="true"]');
  if (Object.keys(audioManifest).length) {
    const cachedAudio = await page.evaluate(async (manifest) => {
      return Promise.all(
        Object.values(manifest).map(async (asset) => {
          const response = await fetch(asset.url);
          return { status: response.status, bytes: (await response.arrayBuffer()).byteLength };
        }),
      );
    }, audioManifest);
    assert.equal(cachedAudio.length, 17);
    assert.ok(cachedAudio.every((asset) => asset.status === 200 && asset.bytes > 1000));
    await page.getByRole('button', { name: 'Sound settings', exact: true }).click();
    const sounds = page.getByRole('dialog', { name: 'Sound', exact: true });
    await sounds.getByRole('checkbox', { name: 'Background music', exact: true }).check();
    await sounds.getByRole('checkbox', { name: 'Enable audio', exact: true }).check();
    await page.waitForFunction(() =>
      window.__recordedSources.some((source) => source.loop && source.buffer?.duration > 80),
    );
    await sounds.getByRole('checkbox', { name: 'Enable audio', exact: true }).uncheck();
    await page.getByRole('button', { name: 'Close sound settings', exact: true }).click();
    checks.push(
      'All 17 generated recordings load offline, and the production player starts the full recorded soundtrack without an API key or network.',
    );
  }
  await page.getByRole('button', { name: 'Zen: Rake the Zen garden', exact: true }).click();
  await expect(page.locator('dialog.room-game[data-game="sand"]')).toBeVisible({ timeout: 12000 });
  await expect(page.locator('[data-sand-ready="true"]')).toBeVisible();
  await page.getByText('Tools & keyboard', { exact: true }).click();
  await page.getByRole('button', { name: 'Draw a spiral', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Music: Make a mixtape', exact: true }).click();
  await expect(page.locator('dialog.room-game[data-game="melody"]')).toBeVisible({
    timeout: 12000,
  });
  await page.getByRole('button', { name: 'Play Do', exact: true }).click();
  await expect(page.locator('.melody-game')).toHaveAttribute('data-step', '1');
  await page.keyboard.press('Escape');
  checks.push(
    'Production precaches the Blender collection and both game chunks; an offline reload renders the custom room and both games remain playable',
  );
  await page.getByRole('link', { name: 'Decorate', exact: true }).click();
  await page.getByRole('button', { name: 'Lamps', exact: true }).click();
  await page
    .getByRole('button', { name: 'Buy and use Mushroom glow for 50 leaves', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Buy & use 50 leaves', exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole('article', { name: 'Mushroom glow', exact: true }).getByText('In your room'),
  ).toBeVisible();
  const installed = await page.evaluate(() => JSON.parse(localStorage.getItem('reminduh-mvp-v1')));
  assert.equal(installed.room.lamp, 'mushroom_lamp');
  assert.equal(installed.market.coins, 70);
  assert.deepEqual(installed.records, {});
  assert.deepEqual(installed.medications, []);
  checks.push(
    'Offline room purchases, equipment and balances persist without changing medication records',
  );
  assert.deepEqual(errors, []);
  checks.push('No production runtime errors');
  await writeFile(
    out + '/offline-results.json',
    JSON.stringify({ status: 'passed', checks }, null, 2),
  );
  console.log(checks.length + ' production room checks passed.');
} finally {
  await browser.close();
}
