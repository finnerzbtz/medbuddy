import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const origin = process.env.MVP_TEST_URL ?? 'http://127.0.0.1:5177';
const out = process.env.ROOM_TEST_OUT ?? 'rebuild/generated/qa-room';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
const context = await browser.newContext({ viewport: { width: 1512, height: 1100 } });
await context.addInitScript(() => {
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
const page = await context.newPage(),
  errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const panel = page.locator('.companion-card');
const preview = async (clip) => {
  await page.evaluate((clip) => window.__appStore.getState().previewState(clip), clip);
  await expect(panel).toHaveAttribute('data-state', clip);
  await page.waitForTimeout(120);
};
// Unit tests walk every path. Here seek to arrival to inspect real rendered props
// without a multi-minute wall-clock wait for each camera/viewport combination.
const arrive = async (clip) => {
  await page.evaluate((clip) => {
    const j = window.__assetCharacter.journey;
    let time = 0;
    for (const s of j.segments) {
      if (s.phase === 'act' && s.animation === clip) {
        j.elapsed = time + 1;
        j.update(0);
        return;
      }
      time += s.seconds;
    }
    throw new Error('Missing arrival segment: ' + clip);
  }, clip);
  await page.waitForTimeout(900);
};
const objectState = (name) =>
  page.evaluate((name) => {
    const o = window.__assetScene.scene.getObjectByName(name);
    if (!o) return null;
    return { visible: o.visible, position: o.position.toArray(), rotation: o.rotation.toArray() };
  }, name);
const screenshot = (name) => panel.screenshot({ path: path.join(out, name + '.png') });
try {
  await page.goto(origin);
  await page.waitForSelector('[data-scene-ready="true"]');
  assert.equal((await objectState('Interactive_blanket')).visible, false);
  const saved = await page.evaluate(() => localStorage.getItem('reminduh-mvp-v1'));
  for (const [label, clip, prop] of [
    ['Tea: Tea break', 'tea', 'Interactive_cup'],
    ['Ball: Play ball', 'ball', 'Interactive_ball'],
    ['Window: Watch the window', 'window', 'Window_butterfly'],
  ]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(panel).toHaveAttribute('data-state', clip);
    const before = await page.evaluate(() => [...window.__assetCharacter.journey.position]);
    await page.waitForTimeout(650);
    const after = await page.evaluate(() => [...window.__assetCharacter.journey.position]);
    assert.ok(
      before.some((n, i) => Math.abs(n - after[i]) > 0.015),
      clip + ' travels before acting',
    );
    await arrive(clip);
    assert.equal(await page.evaluate(() => window.__assetCharacter.journey.animation), clip);
    const first = await objectState(prop);
    assert.ok(first?.visible, prop + ' exists and is visible');
    if (clip === 'tea' || clip === 'tend')
      assert.ok(first.position[1] > 0.65, prop + ' is held above the floor/table');
    await page.waitForTimeout(300);
    const second = await objectState(prop);
    if (clip === 'ball' || clip === 'window')
      assert.ok(
        first.position.some((n, i) => Math.abs(n - second.position[i]) > 0.01),
        prop + ' moves',
      );
    if (clip === 'tend') assert.ok((await objectState('Bonsai_blossoms')).visible);
    await screenshot(clip + '-desktop');
  }
  checks.push(
    'Tea, ball and window activities move Blobby through the room and animate their real 3D props on arrival',
  );
  await preview('idle');
  await arrive('idle');
  const colours = {};
  for (const [clip, effect] of [
    ['worried', 'Rain_cloud'],
    ['sick', 'Cool_compress'],
    ['rest', 'Sleep_symbols'],
    ['petting', 'Mood_effects'],
    ['celebrating', 'Bonsai_blossoms'],
  ]) {
    await preview(clip);
    await arrive(clip);
    assert.ok((await objectState(effect))?.visible, clip + ' has visible mood objects');
    assert.equal((await objectState('Interactive_duvet')).visible, clip === 'rest');
    colours[clip] = await page.evaluate(() => {
      let colour;
      window.__assetCharacter.object.traverse((o) => {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats)
          if (m?.name.toLowerCase().includes('porcelain')) colour = m.color.getHexString();
      });
      return colour;
    });
    await screenshot(clip + '-desktop');
  }
  assert.equal(new Set(Object.values(colours)).size, 5);
  checks.push(
    'Moods change the body colour and contextual objects; the blanket stays exclusive to rest/care',
  );
  // Check a real canvas object hit, not just the matching HTML button.
  await preview('idle');
  await arrive('idle');
  const xy = await page.evaluate(() => {
    const { scene, camera } = window.__assetScene;
    const ball = scene.getObjectByName('Interactive_ball');
    const v = ball.getWorldPosition(ball.position.clone()).project(camera);
    const rect = document.querySelector('.home-scene canvas').getBoundingClientRect();
    return {
      x: rect.left + ((v.x + 1) * rect.width) / 2,
      y: rect.top + ((1 - v.y) * rect.height) / 2,
    };
  });
  await page.mouse.click(xy.x, xy.y);
  await expect(panel).toHaveAttribute('data-state', 'ball');
  assert.equal(await page.evaluate(() => localStorage.getItem('reminduh-mvp-v1')), saved);
  checks.push(
    'Clicking the toy inside the canvas starts play without changing medication records or spending treats',
  );
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 980 });
    for (const clip of ['tea', 'window', 'ball', 'worried', 'rest']) {
      await preview(clip);
      await arrive(clip);
      const bounded = await page.evaluate(() => {
        const { camera } = window.__assetScene,
          o = window.__assetCharacter.object;
        const centre = o.getWorldPosition(o.position.clone());
        const points = [
          [0, 0, 0],
          [0, 1.4, 0],
          [-0.52, 0.7, 0],
          [0.52, 0.7, 0],
        ];
        return points.every(([x, y, z]) => {
          const p = centre.clone().add({ x, y, z }).project(camera);
          return Math.abs(p.x) < 0.98 && Math.abs(p.y) < 0.98;
        });
      });
      assert.ok(bounded, clip + ' stays in the camera at ' + width);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 390 && ['worried', 'tend', 'rest'].includes(clip))
        await screenshot(clip + '-mobile');
    }
  }
  checks.push(
    'Camera keeps Blobby in view at every activity on phone and tablet, with no page overflow',
  );
  await page.evaluate(() => window.__appStore.getState().setPreference('reducedMotion', true));
  await preview('tend');
  const frozen = await page.evaluate(() => ({
    time: window.__assetCharacter.mixer.time,
    position: [...window.__assetCharacter.journey.position],
  }));
  await page.waitForTimeout(300);
  assert.deepEqual(
    await page.evaluate(() => ({
      time: window.__assetCharacter.mixer.time,
      position: [...window.__assetCharacter.journey.position],
    })),
    frozen,
  );
  await expect(page.locator('.garden-cutscene')).toHaveAttribute('data-ready', 'true');
  await preview('rest');
  assert.ok((await objectState('Interactive_duvet')).visible);
  await preview('happy');
  assert.equal((await objectState('Interactive_blanket')).visible, false);
  checks.push(
    'Reduced motion shows each activity at its destination with still props and no movement',
  );
  await page.evaluate(() => window.__appStore.getState().toggleRoomItem('Bonsai'));
  await expect(
    page.getByRole('button', { name: 'Garden: Tend the bonsai', exact: true }),
  ).toBeDisabled();
  assert.equal((await objectState('Bonsai_blossoms')).visible, false);
  await page.evaluate(() => window.__appStore.getState().previewState('tend'));
  await expect(panel).not.toHaveAttribute('data-state', 'tend');
  checks.push('Hidden furniture also hides dependent effects and disables unavailable activities');
  await page.clock.install();
  await page.reload();
  await page.waitForSelector('[data-scene-ready="true"]');
  await page.clock.fastForward(5000);
  await expect(panel).toHaveAttribute('data-state', 'curious');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward(20000);
  await expect(panel).toHaveAttribute('data-state', 'curious');
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward(5000);
  await expect(panel).toHaveAttribute('data-state', 'idle');
  checks.push(
    'Autonomous activities pause in hidden tabs and resume when the room is visible again',
  );
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(out, 'room-results.json'),
    JSON.stringify({ status: 'passed', count: checks.length, checks, colours, errors }, null, 2),
  );
  console.log(checks.length + ' room-life scenarios passed.');
} catch (error) {
  await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true });
  throw error;
} finally {
  await browser.close();
}
