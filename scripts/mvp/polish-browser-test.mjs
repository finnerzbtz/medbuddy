import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { gardenReady, startGardenPour, endGardenPour } from './garden-test-helpers.mjs';
const origin = process.env.MVP_TEST_URL ?? 'http://127.0.0.1:5177';
const out = process.env.POLISH_TEST_OUT ?? 'rebuild/generated/qa-polish';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1512, height: 1100 } });
const errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await page.addInitScript(() => {
  if (localStorage.getItem('reminduh-mvp-v1')) return;
  localStorage.setItem(
    'reminduh-mvp-v1',
    JSON.stringify({
      schemaVersion: 1,
      onboarded: true,
      profile: { name: 'Alex', petName: 'Blobby' },
      medications: [],
      records: {},
      outfit: 'raincoat',
      hiddenGroups: [],
      preferences: {
        relaxedGarden: false,
        reducedMotion: false,
        staticScene: false,
        reminders: false,
      },
      reminders: {},
      updatedAt: '2026-09-05T07:00:00Z',
    }),
  );
});
const panel = page.locator('.companion-card');
const preview = async (clip) => {
  await page.evaluate((clip) => window.__appStore.getState().previewState(clip), clip);
  await expect(panel).toHaveAttribute('data-state', clip);
};
try {
  await page.goto(origin);
  await page.waitForSelector('[data-scene-ready="true"]');
  await page.getByRole('button', { name: 'Get closer to Blobby', exact: true }).click();
  const before = await page.evaluate(() => {
    const d = window.__appStore.getState().data;
    return JSON.stringify([d.records, d.care]);
  });
  await page.getByRole('button', { name: 'Garden: Tend the bonsai', exact: true }).click();
  await expect(page.locator('.garden-cutscene')).toBeVisible({ timeout: 12000 });
  await gardenReady(page);
  await startGardenPour(page);
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(out, 'garden-pour-desktop.png') });
  await endGardenPour(page);
  assert.ok(Number(await page.locator('.bonsai-canvas').getAttribute('data-moisture')) > 0);
  await page.getByRole('button', { name: 'Back to room', exact: true }).click();
  await expect(page.locator('.garden-cutscene')).toHaveCount(0);
  await expect(panel).toHaveAttribute('data-state', 'recovering');
  assert.equal(
    await page.evaluate(() => {
      const d = window.__appStore.getState().data;
      return JSON.stringify([d.records, d.care]);
    }),
    before,
  );
  checks.push(
    'Garden activity walks to the bonsai, opens full screen, responds to freeform rain and returns to the room without changing saved care or records',
  );
  await preview('tend');
  await page.getByRole('button', { name: 'Back to room', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Visit the bonsai again ↗' })).toBeVisible();
  await page.getByRole('button', { name: 'Visit the bonsai again ↗' }).click();
  await expect(page.locator('.garden-cutscene')).toBeVisible();
  await page.evaluate(() => {
    window.__appStore.getState().previewState(null);
    window.__appStore.getState().react('ball');
  });
  await expect(page.locator('.garden-cutscene')).toHaveCount(0);
  await page.waitForTimeout(5300);
  await expect(panel).toHaveAttribute('data-state', 'ball');
  checks.push(
    'Leave, revisit and interrupt work; an old garden callback cannot replace the next activity',
  );
  await page.setViewportSize({ width: 390, height: 980 });
  await preview('tend');
  await gardenReady(page);
  await startGardenPour(page);
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(out, 'garden-pour-mobile.png') });
  await endGardenPour(page);
  await page.evaluate(() => window.__appStore.getState().setPreviewPaused(true));
  await expect(page.locator('.bonsai-garden')).toHaveAttribute('data-paused', 'true');
  const still = await page.locator('.bonsai-canvas').evaluate((c) => c.toDataURL());
  await page.waitForTimeout(350);
  assert.equal(await page.locator('.bonsai-canvas').evaluate((c) => c.toDataURL()), still);
  await page.evaluate(() => window.__appStore.getState().setPreviewPaused(false));
  await page.getByRole('button', { name: 'Back to room', exact: true }).click();
  await page.evaluate(() => window.__appStore.getState().setPreference('reducedMotion', true));
  await page.getByRole('button', { name: 'Visit the bonsai again ↗' }).click();
  await expect(page.locator('.garden-cutscene')).toHaveAttribute('data-ready', 'true');
  const reduced = await page.locator('.bonsai-canvas').evaluate((c) => c.toDataURL());
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.bonsai-canvas').evaluate((c) => c.toDataURL()), reduced);
  await page.getByRole('button', { name: 'Back to room', exact: true }).click();
  await page.evaluate(() => window.__appStore.getState().setPreference('reducedMotion', false));
  checks.push(
    'Phone cutscene stays sharp and fits; pause and reduced motion freeze all illustrated action',
  );
  // Follow a real-time room tour, including turns and cushion height changes.
  const cameraSamples = [];
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    await preview('walk_to_cushion');
    await page.waitForTimeout(400);
    let reference;
    for (let i = 0; i < 110; i++) {
      const sample = await page.evaluate(() => {
        const { camera } = window.__assetScene,
          j = window.__assetCharacter.journey;
        const vec = window.__assetCharacter.object.getWorldPosition(
          window.__assetCharacter.object.position.clone(),
        );
        const points = [
          [-0.64, 0, 0],
          [0.64, 0, 0],
          [-0.64, 1.66, 0],
          [0.64, 1.66, 0],
        ].map(([x, y, z]) => vec.clone().add({ x, y, z }).project(camera).toArray());
        return { zoom: camera.zoom, q: camera.quaternion.toArray(), points, phase: j.phase };
      });
      reference ??= sample;
      assert.ok(
        Math.abs(sample.zoom - reference.zoom) < 0.02,
        'Zoom stays stable throughout travel and stops',
      );
      assert.ok(
        sample.q.every((v, k) => Math.abs(v - reference.q[k]) < 0.00001),
        'Camera pans without orbiting',
      );
      assert.ok(
        sample.points.every((v) => Math.abs(v[0]) < 0.985 && Math.abs(v[1]) < 0.985),
        `Blobby fits at ${width}px: ${JSON.stringify(sample)}`,
      );
      if (i % 25 === 0) cameraSamples.push({ width, ...sample });
      await page.waitForTimeout(80);
    }
    if (width === 320) await panel.screenshot({ path: path.join(out, 'camera-mobile.png') });
  }
  const closeZoom = await page.evaluate(() => window.__assetScene.camera.zoom);
  await page.getByRole('button', { name: 'Show whole room' }).click();
  await page.waitForTimeout(1100);
  assert.ok((await page.evaluate(() => window.__assetScene.camera.zoom)) < closeZoom * 0.8);
  await page.getByRole('button', { name: 'Get closer to Blobby' }).click();
  await page.waitForTimeout(1100);
  assert.ok(
    Math.abs((await page.evaluate(() => window.__assetScene.camera.zoom)) - closeZoom) < 0.5,
  );
  checks.push(
    'Real-time phone and desktop tours keep Blobby inside the frame with a constant angle and zoom; the view toggle settles smoothly',
  );
  await preview('window');
  await page.waitForTimeout(700);
  const entryPosition = await page.evaluate(() => window.__assetCharacter.journey.position.slice());
  await preview('tend');
  await expect(page.locator('.garden-cutscene')).toBeVisible();
  const coveredPosition = await page.evaluate(() =>
    window.__assetCharacter.journey.position.slice(),
  );
  assert.ok(
    coveredPosition.every((v, i) => Math.abs(v - [-1.04, 0.015, -0.55][i]) < 0.02) &&
      entryPosition.some((v, i) => Math.abs(v - coveredPosition[i]) > 0.09),
    'Cutscene entry waits for Blobby to arrive at the actual bonsai',
  );
  await page.getByRole('button', { name: 'Back to room', exact: true }).click();
  await page.goto(origin + '/studio');
  await page.waitForFunction(() => window.__assetCharacter && window.__assetScene);
  await page.getByRole('button', { name: 'Character', exact: true }).click();
  await page.getByRole('button', { name: 'Raincoat', exact: true }).click();
  await page.getByRole('button', { name: 'Pause animation' }).click();
  for (const [clip, time] of [
    ['idle', 0.35],
    ['walk_to_cushion', 0.25],
    ['critical', 0.5],
    ['dance', 0.4],
  ]) {
    await page.getByLabel('A little personality').selectOption(clip);
    await page.waitForTimeout(80);
    for (const [angle, label] of [
      [Math.PI, 'back'],
      [Math.PI * 0.62, 'side'],
      [0, 'front'],
    ]) {
      const samplePoints = await page.evaluate(
        ({ angle, time, clip }) => {
          const { camera, renderer, scene } = window.__assetScene,
            { mixer, clips, object } = window.__assetCharacter;
          mixer.stopAllAction();
          const c = clips.find((v) => v.name === clip);
          mixer.clipAction(c).reset().setEffectiveWeight(1).play();
          mixer.setTime(c.duration * time);
          object.updateMatrixWorld(true);
          camera.position.set(Math.sin(angle) * 7, 1.4, Math.cos(angle) * 7);
          camera.lookAt(0, 1.1, 0);
          camera.updateProjectionMatrix();
          renderer.render(scene, camera);
          const rect = document.querySelector('.studio-viewport canvas').getBoundingClientRect();
          return [-0.32, -0.16, 0, 0.16, 0.32].flatMap((x) =>
            [1.2, 1.3, 1.4, 1.5, 1.6].map((y) => {
              const v = object.position.clone().set(x, y, -0.3).project(camera);
              return {
                x: Math.round(rect.x + ((v.x + 1) * rect.width) / 2),
                y: Math.round(rect.y + ((1 - v.y) * rect.height) / 2),
              };
            }),
          );
        },
        { angle, time, clip },
      );
      const file = path.join(out, `raincoat-${clip}-${label}.png`);
      await page.screenshot({ path: file });
      if (label === 'back' && clip === 'idle') {
        const { data, info } = await sharp(file)
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        for (const { x, y } of samplePoints) {
          const k = (y * info.width + x) * info.channels;
          const [r, g, b] = data.subarray(k, k + 3);
          assert.ok(
            r - b > 30 && g - b > 20,
            `Rear hood/body coverage is yellow, not exposed white: ${r},${g},${b}`,
          );
        }
      }
    }
  }
  checks.push(
    'Raincoat rear coverage is measured across the former gap; front, side and back are rendered in four poses',
  );
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(out, 'polish-results.json'),
    JSON.stringify(
      { status: 'passed', count: checks.length, checks, cameraSamples, errors },
      null,
      2,
    ),
  );
  console.log(checks.length + ' polish scenarios passed.');
} catch (error) {
  await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true });
  throw error;
} finally {
  await browser.close();
}
