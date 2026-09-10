import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
const origin = process.env.MVP_TEST_URL ?? 'http://127.0.0.1:5177';
const out = process.env.COMPANION_TEST_OUT ?? 'rebuild/generated/qa-companion';
await mkdir(out, { recursive: true });
let server;
try {
  if (!(await fetch(origin)).ok) throw new Error('Unavailable');
} catch {
  server = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      '--host',
      '127.0.0.1',
      '--port',
      new URL(origin).port,
      '--strictPort',
    ],
    { stdio: 'ignore' },
  );
  for (let i = 0; i < 80; i++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    if (i === 79) {
      server.kill('SIGTERM');
      throw new Error('Could not start companion test server.');
    }
  }
}
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
const context = await browser.newContext({
  viewport: { width: 1512, height: 1100 },
  timezoneId: 'Europe/London',
});
const page = await context.newPage(),
  errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await page.clock.setFixedTime(new Date('2026-09-09T10:00:00+01:00'));
await context.addInitScript(() => {
  if (localStorage.getItem('reminduh-mvp-v1')) return;
  localStorage.setItem(
    'reminduh-mvp-v1',
    JSON.stringify({
      schemaVersion: 1,
      onboarded: true,
      profile: { name: 'Alex', petName: 'Blobby' },
      medications: [
        {
          id: 'demo-med',
          name: 'Morning routine',
          dosage: '1 tablet · 10 mg per tablet',
          strengthMg: 10,
          tabletsPerDose: 1,
          instructions: '',
          color: '#738962',
          createdAt: '2026-09-05T07:00:00Z',
          archived: false,
          schedules: [
            { from: '2026-09-05', times: ['08:00'], days: [0, 1, 2, 3, 4, 5, 6], active: true },
          ],
          stock: null,
          refillAt: 5,
        },
      ],
      records: {},
      outfit: 'base',
      hiddenGroups: [],
      preferences: { reducedMotion: false, staticScene: false, reminders: false },
      reminders: {},
      updatedAt: '2026-09-05T07:00:00Z',
    }),
  );
});
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('reminduh-mvp-v1')));
const companion = page.locator('.companion-card');
try {
  await page.goto(origin);
  await page.waitForSelector('[data-scene-ready="true"]');
  await expect(companion).toHaveAttribute('data-state', 'critical');
  await page.locator('.dose-card').first().click();
  await page.getByRole('button', { name: 'Record a skip', exact: true }).click();
  await page.getByRole('button', { name: 'Record as skipped', exact: true }).click();
  await expect(companion).toHaveAttribute('data-state', 'celebrating');
  checks.push('An honest skipped check-in brings Blobby back from a low mood into a celebration');
  await page.getByRole('button', { name: 'Cheat codes' }).click();
  const snapshot = JSON.stringify(await saved());
  await page.getByLabel('Cheat code').fill('/poorly');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(companion).toHaveAttribute('data-state', 'sick');
  for (const [label, state] of [
    ['Content', 'idle'],
    ['Hello!', 'wave'],
    ['Happy', 'happy'],
    ['Celebrating', 'celebrating'],
    ['Missing you', 'worried'],
    ['Feeling poorly', 'sick'],
    ['Needs extra care', 'critical'],
    ['Perking up', 'recovering'],
    ['Exploring', 'walk_to_cushion'],
    ['Sleepy', 'rest'],
    ['Snack time', 'feeding'],
    ['Loved', 'petting'],
    ['Playful', 'dance'],
    ['Curious', 'curious'],
    ['Big stretch', 'stretch'],
    ['Tea time', 'tea'],
    ['Little gardener', 'tend'],
    ['Ball time', 'ball'],
    ['Daydreaming', 'window'],
  ]) {
    await page.locator('.state-chips').getByRole('button', { name: label, exact: true }).click();
    await expect(companion).toHaveAttribute('data-state', state);
    await page.waitForTimeout(120);
    if (state === 'tend') {
      await expect(page.locator('.garden-cutscene')).toBeVisible({ timeout: 12000 });
      await page.getByRole('button', { name: 'Skip', exact: true }).click();
      continue;
    }
    const played = await page.evaluate(
      (clip) =>
        window.__assetCharacter.mixer._actions.some(
          (a) =>
            (a._clip.name === clip || a._clip.name === window.__assetCharacter.journey.animation) &&
            (a.isRunning() ||
              (['tea', 'feeding'].includes(a._clip.name) &&
                a.isScheduled() &&
                a.enabled &&
                a.time > 0 &&
                Math.abs(a.time - window.__assetCharacter.journey.actionTime) < 0.05)),
        ),
      state,
    );
    assert.ok(played, state + ' plays an actual Blender animation');
  }
  assert.equal(JSON.stringify(await saved()), snapshot);
  checks.push(
    'All 19 cheat states show their rig animation or garden cutscene without altering saved records or care',
  );
  await page.getByLabel('Cheat code').fill('/unknown');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Try /happy');
  await page
    .locator('.state-chips')
    .getByRole('button', { name: 'Exploring', exact: true })
    .click();
  const p1 = await page.evaluate(() => window.__assetCharacter.journey.position.slice());
  await page.waitForTimeout(700);
  const p2 = await page.evaluate(() => window.__assetCharacter.journey.position.slice());
  assert.ok(p1.some((v, i) => Math.abs(v - p2[i]) > 0.02));
  await page.getByRole('button', { name: 'Pause state animation' }).click();
  await page.waitForTimeout(100);
  const before = await page.evaluate(() => window.__assetCharacter.mixer.time);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__assetCharacter.mixer.time), before);
  checks.push('Walking changes room position; pause stops animation and movement');
  await page.getByRole('button', { name: 'Exit preview' }).click();
  await page.getByRole('button', { name: 'Cheat codes' }).click();
  await page.getByRole('button', { name: /^Feed \d/ }).click();
  await expect(
    page.getByRole('button', { name: 'Select Apple, 3 available', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Select Apple, 3 available', exact: true }).click();
  await page.getByRole('button', { name: 'Feed Apple', exact: true }).click();
  await expect(companion).toHaveAttribute('data-state', 'feeding');
  assert.equal((await saved()).care.days['2026-09-09'].spent, 1);
  await expect(
    page.getByRole('button', { name: 'Select Apple, 2 available', exact: true }),
  ).toBeDisabled();
  await page.waitForTimeout(700);
  await companion.screenshot({ path: path.join(out, 'feeding-desktop.png') });
  await page.reload();
  await page.waitForSelector('[data-scene-ready="true"]');
  assert.equal((await saved()).care.xp, 10);
  await expect(page.locator('.treat-count')).toHaveText('4');
  await page.getByRole('button', { name: 'Cuddle', exact: true }).click();
  await expect(companion).toHaveAttribute('data-state', 'petting');
  await page.getByRole('button', { name: 'Cuddle', exact: true }).click();
  assert.equal((await saved()).care.xp, 15);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(companion).toHaveAttribute('data-state', 'dance');
  assert.equal((await saved()).care.xp, 20);
  checks.push(
    'Feeding consumes treats and persists; free interactions cannot farm the daily bonus',
  );
  await page.getByRole('button', { name: 'Get closer to Blobby', exact: true }).click();
  await page.waitForTimeout(1100);
  const zoom = await page.evaluate(() => window.__assetScene.camera.zoom);
  await page.getByRole('button', { name: 'Show whole room' }).click();
  await expect
    .poll(() => page.evaluate(() => window.__assetScene.camera.zoom))
    .toBeLessThan(zoom * 0.8);
  const roomZoom = await page.evaluate(() => window.__assetScene.camera.zoom);
  await page.getByRole('button', { name: 'Get closer to Blobby' }).click();
  await expect
    .poll(() => page.evaluate(() => window.__assetScene.camera.zoom))
    .toBeGreaterThan(roomZoom * 1.15);
  await page.getByRole('button', { name: 'Cheat codes' }).click();
  await page.locator('.state-chips').getByRole('button', { name: 'Happy', exact: true }).click();
  await page.getByRole('button', { name: 'Cheat codes' }).click();
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(out, 'home-desktop.png') });
  await companion.screenshot({ path: path.join(out, 'room-desktop.png') });
  for (const width of [390, 768, 1512]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1100 });
    await page.getByRole('button', { name: /^Feed \d/ }).click();
    await page.getByRole('button', { name: 'Cheat codes' }).click();
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'No overflow at ' + width,
    );
    for (const button of await page.locator('.companion-actions .button:visible').all()) {
      const bounds = await button.boundingBox(),
        parent = await companion.boundingBox();
      assert.ok(
        bounds.x >= parent.x && bounds.x + bounds.width <= parent.x + parent.width,
        'Care controls fit at ' + width,
      );
    }
    if (width === 390) await companion.screenshot({ path: path.join(out, 'companion-mobile.png') });
    await page.getByRole('button', { name: /^Feed \d/ }).click();
    await page.getByRole('button', { name: 'Cheat codes' }).click();
  }
  checks.push('Closer camera and expanded pantry/cheat panels work on phone, tablet and desktop');
  await page.evaluate(() => window.__appStore.getState().setPreference('reducedMotion', true));
  await page.getByRole('button', { name: 'Cheat codes' }).click();
  await page
    .locator('.state-chips')
    .getByRole('button', { name: 'Feeling poorly', exact: true })
    .click();
  await expect(page.getByText('Reduced motion is on; states show a still pose.')).toBeVisible();
  const still = await page.evaluate(() => window.__assetCharacter.mixer.time);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__assetCharacter.mixer.time), still);
  await page.evaluate(() => window.__appStore.getState().setPreference('staticScene', true));
  await expect(page.locator('.home-scene canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cuddle', exact: true }).click();
  await expect(companion).toHaveAttribute('data-state', 'petting');
  checks.push(
    'Reduced motion freezes expressive poses; static mode retains accessible interaction feedback',
  );
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(out, 'companion-results.json'),
    JSON.stringify({ status: 'passed', count: checks.length, checks, errors }, null, 2),
  );
  console.log(checks.length + ' companion scenarios passed.');
} catch (error) {
  await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true });
  throw error;
} finally {
  await browser.close();
  server?.kill('SIGTERM');
}
