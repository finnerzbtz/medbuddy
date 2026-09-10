import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { gardenReady, startGardenPour, endGardenPour } from './garden-test-helpers.mjs';
const origin = process.env.MVP_TEST_URL ?? 'http://127.0.0.1:5177';
const out = process.env.GARDEN_TEST_OUT ?? 'rebuild/generated/qa-sensory-bonsai';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1040 },
  hasTouch: true,
});
await context.addInitScript(() => {
  localStorage.setItem(
    'reminduh-mvp-v1',
    JSON.stringify({
      schemaVersion: 1,
      onboarded: true,
      profile: { name: 'Test', petName: 'Blobby' },
      medications: [],
      records: {},
      outfit: 'base',
      hiddenGroups: [],
      preferences: { reducedMotion: false, staticScene: false, reminders: false },
      reminders: {},
      updatedAt: '2026-09-05T07:00:00Z',
    }),
  );
  const Base = window.AudioContext;
  window.__gardenAudio = [];
  window.AudioContext = class extends Base {
    constructor(...args) {
      super(...args);
      window.__gardenAudio.push(this);
    }
  };
});
const page = await context.newPage(),
  checks = [],
  errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
const canvas = page.locator('.bonsai-canvas'),
  dialog = page.locator('.bonsai-garden');
const snapshot = () => canvas.evaluate((c) => c.toDataURL());
const moisture = async () => Number(await canvas.getAttribute('data-moisture'));
try {
  await page.goto(origin);
  await page.waitForSelector('[data-scene-ready="true"]');
  const saved = await page.evaluate(() =>
    JSON.stringify(
      Object.fromEntries(
        Object.entries(window.__appStore.getState().data).filter(([key]) => key !== 'updatedAt'),
      ),
    ),
  );
  await page.getByRole('button', { name: 'Garden: Tend the bonsai', exact: true }).click();
  await expect(page.locator('.garden-approach')).toBeVisible();
  assert.equal(await dialog.count(), 0);
  await gardenReady(page);
  assert.equal(await dialog.evaluate((el) => el.matches(':modal')), true);
  assert.deepEqual(await dialog.boundingBox(), { x: 0, y: 0, width: 1440, height: 1040 });
  assert.equal(await page.evaluate(() => window.__assetCharacter.journey.phase), 'act');
  assert.equal(await page.evaluate(() => window.__assetCharacter.journey.animation), 'tend');
  assert.equal(await moisture(), 0);
  assert.equal(await dialog.getByRole('progressbar').count(), 0);
  await expect(dialog).not.toContainText(/Perfect pour|sweet spot|Three buds|out of 9/);
  await page.waitForTimeout(400);
  const frames = await canvas.getAttribute('data-frames');
  await page.waitForTimeout(400);
  assert.equal(await canvas.getAttribute('data-frames'), frames);
  assert.equal(await page.evaluate(() => window.__gardenAudio.length), 0);
  checks.push(
    'Blobby walks to the tree; the open-ended garden starts still and silent, with no scoring or automatic progress',
  );
  await startGardenPour(page);
  await page.waitForFunction(
    () => Number(document.querySelector('.bonsai-canvas').dataset.moisture) > 0.005,
  );
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * 0.63, box.y + box.height * 0.44, { steps: 40 });
  await page.waitForTimeout(700);
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-particles')))
    .toBeGreaterThan(50);
  await page.screenshot({ path: out + '/desktop-rain.png' });
  await endGardenPour(page);
  await expect(canvas).toHaveAttribute('data-active', 'false');
  assert.ok((await moisture()) > 0);
  await expect(canvas).toHaveAttribute('data-particles', '0', { timeout: 5000 });
  checks.push(
    'Rain follows dragging, beads remain on the leaves, drops settle and release stops the shower',
  );
  const wetBeforeBreeze = await moisture();
  await page.getByRole('button', { name: 'Breeze', exact: true }).click();
  // Verify actual foliage displacement, not a changed cursor in a canvas snapshot.
  await page.mouse.move(box.x + box.width * 0.54, box.y + box.height * 0.37);
  await expect(canvas).toHaveAttribute('data-active', 'true');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-canopy-sway')))
    .toBeGreaterThan(0.2);
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-blown-particles')))
    .toBeGreaterThan(0);
  await page.screenshot({ path: out + '/blowing-droplets.png' });
  await expect.poll(moisture).toBeLessThan(wetBeforeBreeze * 0.6);
  checks.push(
    'Rain builds visible beads and a fuller stream; breeze detaches those beads and clears moisture from the foliage',
  );
  const beforeBreeze = await snapshot();
  await page.waitForTimeout(700);
  assert.ok((await snapshot()) !== beforeBreeze, 'A stationary brush should sustain a gentle sway');
  await page.screenshot({ path: out + '/breeze-desktop.png' });
  await page.mouse.move(10, 10);
  await expect(canvas).toHaveAttribute('data-active', 'false');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-canopy-sway')), { timeout: 6000 })
    .toBeLessThan(0.003);
  await page.getByRole('button', { name: 'Brush the tree', exact: true }).click();
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-canopy-sway')))
    .toBeGreaterThan(0.2);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.evaluate(() => window.__appStore.getState().setPreference('reducedMotion', true));
  await page.getByRole('button', { name: 'Clear droplets', exact: true }).click();
  await page.getByRole('button', { name: 'Brush the tree', exact: true }).click();
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-breeze-response')))
    .toBeGreaterThan(0.4);
  await expect(canvas).toHaveAttribute('data-canopy-sway', '0.0000');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  const breezeStill = await snapshot();
  await page.waitForTimeout(200);
  assert.ok((await snapshot()) === breezeStill, 'Reduced-motion breeze feedback stays still');
  await page.evaluate(() => window.__appStore.getState().setPreference('reducedMotion', false));
  checks.push(
    'Breeze works on mouse hover and one-press brushing, keeps the canopy swaying, settles on exit and provides still feedback with reduced motion',
  );
  await page.getByRole('button', { name: 'Rain', exact: true }).click();
  await page.getByRole('button', { name: 'Clear droplets', exact: true }).click();
  assert.equal(await moisture(), 0);
  await page.getByRole('button', { name: 'Shower the tree', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Shower the tree', exact: true })).toBeVisible({
    timeout: 6500,
  });
  assert.ok((await moisture()) > 0.03);
  checks.push(
    'Breeze bends leaves; one-press showers work without dragging or holding and stop on their own',
  );
  await startGardenPour(page);
  await page.evaluate(() => window.__appStore.getState().setPreviewPaused(true));
  await expect(dialog).toHaveAttribute('data-paused', 'true');
  await page.mouse.up();
  const still = await snapshot();
  await page.waitForTimeout(250);
  assert.ok((await snapshot()) === still, 'Paused canvas should not advance');
  await expect(canvas).toHaveAttribute('data-active', 'false');
  await page.getByRole('button', { name: 'Resume garden', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-active', 'false');
  await startGardenPour(page);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-active', 'false');
  const away = await snapshot();
  await page.waitForTimeout(150);
  assert.ok((await snapshot()) === away, 'Hidden canvas should not advance');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  checks.push(
    'Pause and app blur stop inputs, particles and sound; returning never resumes a held action',
  );
  await page.getByRole('button', { name: 'Clear droplets', exact: true }).click();
  await startGardenPour(page, 'keyboard');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(350);
  await endGardenPour(page, 'keyboard');
  assert.ok((await moisture()) > 0);
  const axe = await new AxeBuilder({ page }).include('.bonsai-garden').analyze();
  await writeFile(out + '/accessibility.json', JSON.stringify(axe.violations, null, 2));
  assert.deepEqual(axe.violations, []);
  checks.push(
    'Arrow keys and toggle Space provide keyboard control; the garden passes its automated accessibility scan',
  );
  await page.getByRole('button', { name: 'Sound off', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sound on', exact: true })).toBeVisible();
  await startGardenPour(page);
  await page.waitForTimeout(150);
  await endGardenPour(page);
  assert.ok(await page.evaluate(() => window.__gardenAudio.some((c) => c.state === 'running')));
  await page.getByRole('button', { name: 'Sound on', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__gardenAudio.filter((c) => c.state !== 'closed').length),
    )
    .toBe(1);
  checks.push('Sensory audio is opt-in and its dedicated context closes when muted');
  for (const [width, height] of [
    [390, 844],
    [320, 568],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(100);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page
      .getByRole('button', { name: 'Shower the tree', exact: true })
      .scrollIntoViewIfNeeded();
    const r = await page
      .getByRole('button', { name: 'Shower the tree', exact: true })
      .boundingBox();
    assert.ok(r.x >= 0 && r.x + r.width <= width);
    await page.evaluate(() => document.querySelector('.bonsai-garden').scrollTo(0, 0));
    await page.screenshot({ path: out + `/bonsai-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const r = await canvas.boundingBox();
  await page.getByRole('button', { name: 'Breeze', exact: true }).click();
  const touch = await context.newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: r.x + r.width * 0.54, y: r.y + r.height * 0.37 }],
  });
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-canopy-sway')))
    .toBeGreaterThan(0.15);
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: r.x + r.width * 0.46, y: r.y + r.height * 0.4 }],
  });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(canvas).toHaveAttribute('data-active', 'false');
  await touch.detach();
  checks.push('A real touch drag activates the breeze and lifting the finger stops it');
  await page.getByRole('button', { name: 'Rain', exact: true }).click();
  await startGardenPour(page);
  await page.waitForTimeout(700);
  await page.screenshot({ path: out + '/mobile-rain.png' });
  await endGardenPour(page);
  await page.touchscreen.tap(r.x + r.width * 0.5, r.y + r.height * 0.4);
  await expect(canvas).toHaveAttribute('data-active', 'false');
  await page.evaluate(() => window.__appStore.getState().setPreference('reducedMotion', true));
  await page.getByRole('button', { name: 'Shower the tree', exact: true }).click();
  await page.waitForTimeout(500);
  assert.equal(await canvas.getAttribute('data-particles'), '0');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  const reducedStill = await snapshot();
  await page.waitForTimeout(250);
  assert.ok((await snapshot()) === reducedStill, 'Reduced-motion canvas should rest after input');
  checks.push(
    'Touch and small/landscape screens stay usable; reduced motion keeps wet-leaf feedback without falling particles or swaying',
  );
  const reducedWet = await moisture();
  await page.getByRole('button', { name: 'Breeze', exact: true }).click();
  await page.getByRole('button', { name: 'Brush the tree', exact: true }).click();
  await expect.poll(moisture).toBeLessThan(reducedWet * 0.5);
  await expect(canvas).toHaveAttribute('data-particles', '0');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  checks.push('Reduced-motion breeze also removes water, with no airborne particles');
  await page.getByRole('button', { name: 'Back to room', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Garden: Tend the bonsai', exact: true }),
  ).toBeFocused();
  await page.evaluate(() => window.__appStore.getState().setPreference('reducedMotion', false));
  assert.equal(
    await page.evaluate(() =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(window.__appStore.getState().data).filter(([key]) => key !== 'updatedAt'),
        ),
      ),
    ),
    saved,
  );
  await page.getByRole('button', { name: 'Garden: Tend the bonsai', exact: true }).click();
  await gardenReady(page);
  await page.getByRole('button', { name: 'Shower the tree', exact: true }).click();
  await page.evaluate(() => window.__appStore.getState().react('ball'));
  await expect(dialog).toHaveCount(0);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => document.documentElement.style.overflow), '');
  checks.push(
    'Leaving restores focus without rewards or medication changes; an interrupted shower cleans up the activity',
  );
  assert.deepEqual(errors, []);
  await writeFile(
    out + '/results.json',
    JSON.stringify({ passed: checks.length, checks, errors }, null, 2),
  );
  console.log(checks.length + ' sensory bonsai scenarios passed.');
} catch (error) {
  await page.screenshot({ path: out + '/failure.png', fullPage: true });
  throw error;
} finally {
  await browser.close();
}
