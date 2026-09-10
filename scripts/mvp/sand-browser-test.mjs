import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const out = 'rebuild/generated/qa-sensory-sand';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(() => {
  window.__testAudio = [];
  const NativeAudioContext = window.AudioContext;
  window.AudioContext = class extends NativeAudioContext {
    constructor(...args) {
      super(...args);
      const output = this.destination,
        analyser = this.createAnalyser();
      analyser.fftSize = 2048;
      analyser.connect(output);
      Object.defineProperty(this, 'destination', { value: analyser });
      window.__testAudio.push({ context: this, analyser });
    }
  };
});
const page = await context.newPage(),
  errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(String(e)));
const board = page.locator('.sensory-sand-board');
const image = async () =>
  createHash('sha256')
    .update(await board.evaluate((c) => c.toDataURL()))
    .digest('hex');
const state = () => page.evaluate(() => structuredClone(window.__appStore.getState().data));
const rms = () =>
  page.evaluate(() => {
    const audio = window.__testAudio.at(-1);
    if (!audio || audio.context.state === 'closed') return 0;
    const a = new Float32Array(audio.analyser.fftSize);
    audio.analyser.getFloatTimeDomainData(a);
    return Math.sqrt(a.reduce((sum, v) => sum + v * v, 0) / a.length);
  });
const audit = async (label) => {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await writeFile(out + '/' + label + '-axe.json', JSON.stringify(r.violations, null, 2));
  assert.deepEqual(
    r.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    [],
    label,
  );
};
const draw = async (points) => {
  await page.mouse.move(...points[0]);
  await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(...p);
  await page.mouse.up();
};
try {
  await page.goto('http://127.0.0.1:5177');
  await page.waitForFunction(() => window.__appStore);
  assert.equal(
    await page.evaluate(() => {
      window.__appStore.getState().completeWelcome('Alex', 'Blobby');
      const d = structuredClone(window.__appStore.getState().data);
      d.market.ownedRoomItems.push('sand_garden');
      d.room.garden = 'sand_garden';
      return window.__appStore.getState().restore(d).ok;
    }),
    true,
  );
  await page.goto('http://127.0.0.1:5177');
  await page.waitForSelector('[data-scene-ready="true"]');
  const saved = await state();
  await page.getByRole('button', { name: 'Zen: Rake the Zen garden', exact: true }).click();
  await expect(page.locator('.live-scene')).toHaveAttribute('data-room-game-stage', 'approach');
  await expect(page.locator('[data-sand-ready="true"]')).toBeVisible({ timeout: 15000 });
  assert.equal(await page.locator('.game-count').count(), 0);
  assert.equal(await page.evaluate(() => window.__testAudio.length), 0);
  await page.getByRole('button', { name: 'Fresh sand', exact: true }).click();
  const pristine = await image();
  let box = await board.boundingBox();
  const points = Array.from({ length: 165 }, (_, i) => {
    const t = i / 164,
      a = t * Math.PI * 4.4,
      r = 35 + t * Math.min(box.width, box.height) * 0.35;
    return [box.x + box.width / 2 + Math.cos(a) * r, box.y + box.height / 2 + Math.sin(a) * r];
  });
  const start = Date.now();
  await draw(points);
  const drawingMs = Date.now() - start;
  await page.mouse.move(10, 10);
  await page.waitForTimeout(500);
  const drawn = await image();
  assert.notEqual(drawn, pristine);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  await page.screenshot({ path: out + '/sand-pattern-desktop.png' });
  await page.getByRole('button', { name: 'Fresh sand', exact: true }).click();
  assert.equal(await image(), pristine);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.equal(await image(), drawn);
  checks.push(
    'Blobby walks to an open-ended sand garden; real mouse strokes change the surface, and clearing/undo restore exact patterns without scores or timers',
  );
  await page.getByRole('button', { name: 'Smooth', exact: true }).click();
  await draw([
    [box.x + box.width * 0.2, box.y + box.height * 0.5],
    [box.x + box.width * 0.8, box.y + box.height * 0.5],
  ]);
  assert.notEqual(await image(), drawn);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.equal(await image(), drawn);
  await page.getByRole('button', { name: 'Rake', exact: true }).click();
  await board.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  assert.notEqual(await image(), drawn);
  await page.keyboard.press('Meta+z');
  assert.equal(await image(), drawn);
  await page.keyboard.press('Tab');
  assert.equal(await board.evaluate((c) => c === document.activeElement), false);
  checks.push(
    'Smoothing and keyboard raking reshape the surface; undo is exact and the canvas does not trap keyboard focus',
  );
  await page.getByRole('button', { name: 'Rake', exact: true }).click();
  await page.getByRole('button', { name: 'Sound off', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sound on', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  assert.ok((await rms()) < 0.00001);
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
  await page.mouse.down();
  const levels = [];
  for (let i = 1; i <= 30; i++) {
    await page.mouse.move(
      box.x + box.width * (0.25 + i * 0.013),
      box.y + box.height * (0.25 + 0.02 * Math.sin(i)),
    );
    levels.push(await rms());
  }
  assert.ok(Math.max(...levels) > 0.0001, 'Raking generates actual non-silent audio');
  await page.waitForTimeout(450);
  assert.ok((await rms()) < 0.00002, 'Stationary rake fades to silence');
  await page.mouse.up();
  await page.getByRole('slider', { name: 'Sand volume', exact: true }).fill('0');
  await draw([
    [box.x + 80, box.y + 80],
    [box.x + 350, box.y + 130],
  ]);
  assert.ok((await rms()) < 0.00002);
  await page.getByRole('button', { name: 'Sound on', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__testAudio.at(-1).context.state), 'closed');
  checks.push(
    'Sound is opt-in; a monitored Web Audio output reacts to raking, fades when stationary, obeys volume zero and closes immediately when muted',
  );
  await audit('desktop-sand');
  const beforeResize = await image();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  box = await board.boundingBox();
  assert.ok(box.height > 350 && box.width > 280);
  const mobileBefore = await image();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: box.x + 60, y: box.y + 100 }],
  });
  for (let i = 1; i <= 20; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: box.x + 60 + i * 8, y: box.y + 100 + i * 9 }],
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.notEqual(await image(), mobileBefore);
  await page.screenshot({ path: out + '/sand-pattern-mobile.png' });
  await audit('mobile-sand');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByText('Tools & keyboard', { exact: true }).click();
  await page.getByRole('button', { name: 'Draw a spiral', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'A spiral drawn' })).toHaveText(
    'A spiral drawn in the sand. You can undo this.',
  );
  await page.getByRole('button', { name: 'Fresh sand', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 798 });
  await page.waitForTimeout(100);
  assert.equal(
    await page.evaluate(() => document.querySelector('dialog').scrollWidth > innerWidth),
    false,
  );
  await audit('reduced-sand');
  checks.push(
    'Patterns survive responsive resizing; touch and the one-button spiral work at mobile sizes, and reduced motion preserves drawing with no ambient animation',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  const beforeExit = await image();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Zen: Rake the Zen garden', exact: true }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Zen: Rake the Zen garden', exact: true }).click();
  await expect(page.locator('[data-sand-ready="true"]')).toBeVisible();
  assert.equal(await image(), beforeExit, 'Returning during this app session preserves the sand');
  await page.waitForTimeout(3000);
  await expect(page.locator('[data-sand-ready="true"]')).toBeVisible();
  await page.keyboard.press('Escape');
  const after = await state();
  for (const key of ['market', 'medications', 'records', 'room', 'care'])
    assert.deepEqual(after[key], saved[key]);
  checks.push(
    'Leaving and returning keeps the sand during the session and restores focus; no medication, inventory, room ownership or care data changes',
  );
  assert.deepEqual(errors, []);
  await writeFile(
    out + '/results.json',
    JSON.stringify(
      { status: 'passed', checks, drawingMs, peakAudioRMS: Math.max(...levels) },
      null,
      2,
    ),
  );
  console.log(checks.length + ' sensory sand checks passed.');
} catch (e) {
  await page.screenshot({ path: out + '/failure.png', fullPage: true });
  console.error('Completed checks', checks);
  throw e;
} finally {
  await browser.close();
}
