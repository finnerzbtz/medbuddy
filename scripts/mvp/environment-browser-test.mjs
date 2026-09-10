import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const out = process.env.ROOM_DAY_TEST_OUT ?? 'rebuild/generated/qa-environment';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  timezoneId: 'Europe/London',
});
const page = await context.newPage(),
  errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(String(e)));
await context.addInitScript(() => {
  if (!localStorage.getItem('reminduh-mvp-v1'))
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
    );
});
const panel = page.locator('.companion-card');
const scene = () =>
  page.evaluate(() => {
    const s = window.__assetScene.scene,
      j = window.__assetCharacter.journey;
    const find = (group) => {
      let v;
      s.traverse((n) => {
        if (n.userData.asset_group === group) v = n.visible;
      });
      return v;
    };
    return {
      lamp: s.getObjectByName('Room_lamp').intensity,
      day: s.getObjectByName('Room_daylight').intensity,
      sun: find('Window_sun'),
      moon: find('Window_moon'),
      stars: find('Window_stars'),
      can: s.getObjectByName('Interactive_can').position.toArray(),
      bed: find('Bed'),
      position: j.position,
      activity: j.animation,
      phase: j.phase,
      sleeper: s.getObjectByName('Blobby_sleep_pose').rotation.x,
      duvet: s.getObjectByName('Interactive_duvet').visible,
    };
  });
try {
  await page.clock.setFixedTime(new Date('2026-09-05T12:00:00+01:00'));
  await page.goto(process.env.MVP_TEST_URL ?? 'http://127.0.0.1:5177/');
  await page.waitForSelector('[data-scene-ready="true"]');
  await page.evaluate(() => window.__appStore.getState().previewState('idle'));
  await page.waitForTimeout(1500);
  await expect(panel).toHaveAttribute('data-time-of-day', 'day');
  let s = await scene();
  assert.ok(s.sun && !s.moon && !s.stars && s.bed);
  assert.ok(s.can[1] > 1);
  await panel.screenshot({ path: out + '/day-desktop.png' });
  checks.push('Daylight uses local noon; watering can is elevated and bed is visible');
  await page.clock.setFixedTime(new Date('2026-09-05T23:00:00+01:00'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(1000);
  await expect(panel).toHaveAttribute('data-time-of-day', 'night');
  s = await scene();
  assert.ok(!s.sun && s.moon && s.stars && s.day < 0.5);
  await panel.screenshot({ path: out + '/night-desktop.png' });
  checks.push('An open room changes to moonlight and stars when the clock advances into night');
  await page.getByRole('button', { name: 'Turn lamp off', exact: true }).click();
  await expect.poll(async () => (await scene()).lamp).toBe(0);
  await panel.screenshot({ path: out + '/lamp-off-desktop.png' });
  await page.reload();
  await page.waitForSelector('[data-scene-ready="true"]');
  await expect.poll(async () => (await scene()).lamp).toBe(0);
  await expect(page.getByRole('button', { name: 'Turn lamp on' })).toBeVisible();
  await page.getByRole('button', { name: 'Turn lamp on', exact: true }).click();
  await expect.poll(async () => (await scene()).lamp).toBeGreaterThan(0);
  checks.push('Lamp switch controls the real light and persists through reload');
  const lampPoint = await page.evaluate(() => {
    const { camera } = window.__assetScene,
      p = camera.position.clone().set(2.02, 0.95, -1.52).project(camera),
      r = document.querySelector('.home-scene canvas').getBoundingClientRect();
    return { x: r.left + ((p.x + 1) * r.width) / 2, y: r.top + ((1 - p.y) * r.height) / 2 };
  });
  await page.mouse.click(lampPoint.x, lampPoint.y);
  await expect(page.getByRole('button', { name: 'Turn lamp on', exact: true })).toBeVisible();
  await expect.poll(async () => (await scene()).lamp).toBe(0);
  await page.getByRole('button', { name: 'Turn lamp on', exact: true }).click();
  await expect.poll(async () => (await scene()).lamp).toBeGreaterThan(0);
  checks.push('Clicking the actual bedside lamp toggles its light');
  const saved = await page.evaluate(() => JSON.stringify(window.__appStore.getState().data));
  await page.getByRole('button', { name: 'Put Blobby to bed' }).click();
  await expect.poll(async () => (await scene()).phase).toBe('travel');
  await page.waitForTimeout(5000);
  s = await scene();
  assert.equal(s.activity, 'rest');
  assert.ok(s.duvet && s.sleeper < -1.3);
  await panel.screenshot({ path: out + '/sleep-desktop.png' });
  for (const outfit of ['base', 'glasses', 'sweater', 'raincoat']) {
    await page.evaluate((v) => window.__appStore.getState().setOutfit(v), outfit);
    await page.waitForTimeout(300);
    await panel.screenshot({ path: out + '/sleep-' + outfit + '.png' });
  }
  await page.getByRole('button', { name: 'Wake Blobby' }).click();
  await expect.poll(async () => (await scene()).activity).toBe('stretch');
  await page.waitForTimeout(5000);
  assert.equal((await scene()).duvet, false);
  checks.push('Bed action walks, settles under the duvet, and stands before returning home');
  const afterCare = await page.evaluate(() => window.__appStore.getState().data);
  for (const key of ['medications', 'records', 'care'])
    assert.deepEqual(afterCare[key], JSON.parse(saved)[key]);
  await page.clock.setFixedTime(new Date('2026-09-05T23:00:00+01:00'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.evaluate(() => {
    window.__appStore.getState().setPreference('reducedMotion', true);
    window.__appStore.getState().previewState('idle');
  });
  await page.getByRole('button', { name: 'Put Blobby to bed' }).click();
  await page.waitForTimeout(200);
  s = await scene();
  assert.ok(s.duvet && s.sleeper < -1.3);
  await page.getByRole('button', { name: 'Turn lamp off' }).click();
  await expect.poll(async () => (await scene()).lamp).toBe(0);
  await page.getByRole('button', { name: 'Turn lamp on' }).click();
  checks.push('Reduced-motion sleep and lamp changes render immediately without animation');
  for (const width of [320, 390, 485]) {
    await page.setViewportSize({ width, height: 1200 });
    await page.waitForTimeout(600);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await panel.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await panel.screenshot({ path: out + '/sleep-' + width + '.png' });
  }
  checks.push('Room controls fit 320, 390 and 485px without horizontal overflow');
  await page.evaluate(() => window.__appStore.getState().toggleRoomItem('Bed'));
  await expect(page.getByRole('button', { name: 'Put Blobby to bed' })).toBeDisabled();
  assert.equal((await scene()).duvet, false);
  await page.evaluate(() => window.__appStore.getState().toggleRoomItem('Lamp'));
  await expect.poll(async () => (await scene()).lamp).toBe(0);
  checks.push('Hiding furniture disables its controls and removes dependent light/cover');
  assert.deepEqual(errors, []);
  await writeFile(out + '/results.json', JSON.stringify({ status: 'passed', checks }, null, 2));
  console.log(checks);
} catch (e) {
  await page.screenshot({ path: out + '/failure.png', fullPage: true });
  throw e;
} finally {
  await browser.close();
}
