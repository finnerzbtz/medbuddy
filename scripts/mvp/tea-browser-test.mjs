import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const origin = process.env.MVP_TEST_URL ?? 'http://127.0.0.1:5177';
const out = process.env.TEA_TEST_OUT ?? 'rebuild/generated/qa-tea';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
const context = await browser.newContext({ viewport: { width: 1512, height: 1050 } });
await context.addInitScript(() =>
  localStorage.setItem(
    'reminduh-mvp-v1',
    JSON.stringify({
      schemaVersion: 1,
      onboarded: true,
      profile: { name: 'Alex', petName: 'Blobby' },
      medications: [],
      records: {},
      outfit: 'base',
      hiddenGroups: [],
      preferences: { reducedMotion: false, staticScene: false, reminders: false },
      reminders: {},
      updatedAt: '2026-09-05T07:00:00Z',
    }),
  ),
);
const page = await context.newPage(),
  errors = [],
  checks = [],
  samples = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const panel = page.locator('.companion-card');
const state = () =>
  page.evaluate(() => {
    const { object, journey: j, mixer } = window.__assetCharacter;
    const { scene, camera } = window.__assetScene;
    const cup = scene.getObjectByName('Interactive_cup');
    const bones = [];
    object.traverse((n) => {
      if (n.isBone && n.name.startsWith('Arm')) bones.push(n);
    });
    const gripDistances = bones.map((b) =>
      b.localToWorld(b.position.clone().set(0, 0.522786 * 1.08, 0)).distanceTo(cup.position),
    );
    const rimUp = cup.position.clone().set(0, 1, 0).applyQuaternion(cup.quaternion);
    return {
      clip: window.__appStore.getState().currentAnimation,
      phase: j.phase,
      animation: j.animation,
      time: j.actionTime,
      elapsed: j.elapsed,
      duration: j.duration,
      position: [...j.position],
      cup: cup.position.toArray(),
      cupRotation: cup.quaternion.toArray(),
      gripDistances,
      tilt: Math.acos(Math.min(1, rimUp.y)),
      camera: camera.quaternion.toArray(),
      zoom: camera.zoom,
      nativeTime: mixer._actions.find((a) => a._clip.name === 'tea')?.time,
      bones: bones.map((b) => b.matrixWorld.toArray()),
    };
  });
const home = [-1.14, 0.6, 0.7],
  distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const seek = async (t) => {
  await page.evaluate((t) => {
    const j = window.__assetCharacter.journey;
    if (!j.originalUpdate) j.originalUpdate = j.update;
    let start = 0;
    for (const s of j.segments) {
      if (s.phase === 'act' && s.animation === 'tea') break;
      start += s.seconds;
    }
    j.elapsed = start + t;
    j.originalUpdate(0);
    j.update = () => j.originalUpdate(0);
  }, t);
  await page.waitForTimeout(600);
};
const release = () =>
  page.evaluate(() => {
    const j = window.__assetCharacter.journey;
    if (j.originalUpdate) {
      j.update = j.originalUpdate;
      delete j.originalUpdate;
    }
  });
try {
  await page.goto(origin);
  await page.waitForSelector('[data-scene-ready="true"]');
  await page.getByRole('button', { name: 'Get closer to Blobby', exact: true }).click();
  const saved = await page.evaluate(() => localStorage.getItem('reminduh-mvp-v1'));
  await expect(page.locator('.room-activities')).toHaveCount(0);
  await expect(page.getByText('A happy little tummy', { exact: true })).toHaveCount(0);
  await expect(
    page
      .getByRole('group', { name: 'Care and activities' })
      .getByRole('button', { name: 'Tea: Tea break', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Tea: Tea break', exact: true }).click();
  const started = Date.now();
  while (Date.now() - started < 25000) {
    const s = await state();
    samples.push(s);
    if (s.clip === 'idle') break;
    await page.waitForTimeout(85);
  }
  assert.equal(samples.at(-1).clip, 'idle', 'Tea finishes on the scene clock');
  assert.ok(samples.some((s) => s.phase === 'travel' && s.animation === 'walk_to_cushion'));
  const held = samples.filter((s) => s.animation === 'tea' && s.time > 1.65 && s.time < 6.6);
  assert.ok(held.length > 15, 'Observe the complete real-time action');
  assert.ok(
    held.every((s) => s.gripDistances.every((d) => d < 0.125)),
    'Both baked hands stay at the actual cup',
  );
  assert.ok(
    held.every((s) => Math.abs(s.nativeTime - s.time) < 0.025),
    'Rig and prop share one clock',
  );
  assert.ok(
    held.some((s) => s.time > 3.5 && s.time < 3.9 && s.tilt > 0.35),
    'First sip tilts the cup',
  );
  assert.ok(
    held.some((s) => s.time > 4.6 && s.time < 4.8 && s.tilt > 0.25),
    'Second sip tilts the cup',
  );
  assert.ok(
    samples
      .filter((s) => s.animation === 'tea' && s.time < 1.1)
      .every((s) => distance(s.cup, home) < 0.002),
    'Cup stays on the table until pickup',
  );
  assert.ok(distance(samples.at(-1).cup, home) < 0.002, 'Cup returns to its saucer');
  assert.ok(distance(samples.at(-1).position, [1.07, 0.35, 0.76]) < 0.01, 'Blobby returns home');
  assert.ok(
    samples.every((s) => distance(s.camera, samples[0].camera) < 0.00001),
    'Camera retains its viewing angle',
  );
  assert.equal(await page.evaluate(() => localStorage.getItem('reminduh-mvp-v1')), saved);
  checks.push(
    'The real-time journey walks to the cup, holds it with both hands, takes two distinct sips, places it on its saucer and returns home without changing records',
  );
  await page.evaluate(() => window.__appStore.getState().previewState('tea'));
  await page.waitForTimeout(200);
  for (const outfit of ['base', 'glasses', 'sweater', 'raincoat']) {
    await page.evaluate((v) => window.__appStore.getState().setOutfit(v), outfit);
    await seek(3.6);
    const s = await state();
    assert.ok(s.gripDistances.every((d) => d < 0.125));
    await panel.screenshot({ path: path.join(out, outfit + '-sip.png') });
  }
  await release();
  await page.evaluate(() => window.__appStore.getState().setPreviewPaused(true));
  const paused = await state();
  await page.waitForTimeout(1200);
  const after = await state();
  for (const key of ['elapsed', 'cup', 'cupRotation', 'bones'])
    assert.deepEqual(after[key], paused[key], key + ' freezes');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.__appStore.getState().setPreviewPaused(false);
  });
  await page.waitForTimeout(100);
  const hidden = await state();
  await page.waitForTimeout(1000);
  assert.deepEqual((await state()).bones, hidden.bones);
  assert.equal((await state()).elapsed, hidden.elapsed);
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  checks.push(
    'All four outfits keep their grip; pause and a hidden tab freeze the cup, rig and action clock together',
  );
  await page.evaluate(() => {
    window.__appStore.getState().previewState(null);
    window.__appStore.getState().react('dance');
  });
  await page.waitForTimeout(1400);
  assert.ok(distance((await state()).cup, home) < 0.005);
  await page.getByRole('button', { name: 'Tea: Tea break', exact: true }).click();
  await page.waitForTimeout(250);
  await seek(3.6);
  await page.getByRole('button', { name: 'Show whole room', exact: true }).click();
  await page.waitForTimeout(700);
  const wide = (await state()).zoom;
  await page.getByRole('button', { name: 'Get closer to Blobby', exact: true }).click();
  await page.waitForTimeout(700);
  assert.ok((await state()).zoom > wide * 1.8, 'Wide view remains under user control');
  checks.push(
    'Interrupting tea returns the prop cleanly; replay and the whole-room camera toggle remain functional',
  );
  for (const width of [320, 390, 485, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(350);
    const bounded = await page.evaluate(() => {
      const root = document.querySelector('.companion-actions').getBoundingClientRect();
      const buttons = [...document.querySelectorAll('.companion-actions .button')].filter(
        (b) => b.getBoundingClientRect().width,
      );
      const { object } = window.__assetCharacter,
        { camera } = window.__assetScene;
      const p = object.getWorldPosition(object.position.clone());
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        buttons: buttons.every((b) => {
          const r = b.getBoundingClientRect();
          return r.left >= root.left - 1 && r.right <= root.right + 1 && r.height >= 44;
        }),
        character: [
          [0, 0, 0],
          [0, 1.4, 0],
          [-0.6, 0.7, 0],
          [0.6, 0.7, 0],
        ].every(([x, y, z]) => {
          const q = p.clone().add({ x, y, z }).project(camera);
          return Math.abs(q.x) < 0.98 && Math.abs(q.y) < 0.98;
        }),
      };
    });
    assert.equal(bounded.overflow, false, width + ' viewport does not overflow');
    assert.ok(bounded.buttons);
    assert.ok(bounded.character, width + ' frames the whole character');
    await panel.screenshot({ path: path.join(out, 'mobile-' + width + '.png') });
  }
  checks.push(
    'Unified activity controls have accessible tap targets and no horizontal overflow; tea stays framed at 320, 390, 485 and 768 pixels',
  );
  await release();
  await page.evaluate(() => {
    window.__appStore.getState().previewState('idle');
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Tea: Tea break', exact: true }).click();
  await page.waitForTimeout(300);
  const still = await state();
  assert.equal(still.phase, 'act');
  assert.equal(still.animation, 'tea');
  assert.ok(still.gripDistances.every((d) => d < 0.125));
  await page.waitForTimeout(800);
  assert.deepEqual((await state()).bones, still.bones);
  await page.waitForFunction(() => window.__appStore.getState().currentAnimation === 'idle');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'Tea: Tea break', exact: true }).click();
  await page.getByRole('link', { name: 'Medications', exact: true }).click();
  await expect(page).toHaveURL(/\/meds$/);
  await expect
    .poll(() => page.evaluate(() => window.__appStore.getState().reactionUntil === -1), {
      message: 'Navigation releases the completion lock after the scene unmounts',
    })
    .toBe(false);
  checks.push(
    'Reduced motion shows a calm held-cup pose and finishes; navigation releases an unfinished activity',
  );
  assert.deepEqual(errors, []);
  checks.push('No browser console or runtime errors');
  await writeFile(
    path.join(out, 'results.json'),
    JSON.stringify({ status: 'passed', checks, samples }, null, 2),
  );
  console.log(checks.length + ' tea browser checks passed.');
} catch (error) {
  await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true });
  throw error;
} finally {
  await browser.close();
}
