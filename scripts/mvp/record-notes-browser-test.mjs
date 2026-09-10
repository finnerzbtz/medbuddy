import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const out = 'rebuild/generated/qa-record-notes';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
const context = await browser.newContext({ viewport: { width: 1000, height: 1100 } });
const page = await context.newPage();
const errors = [],
  checks = [];
page.on('pageerror', (error) => errors.push(String(error)));
const origin = 'http://127.0.0.1:5177';
const notes = () =>
  page.evaluate(() => {
    const group = window.__assetScene.scene.getObjectByName('Record music notes');
    return {
      visible: group.visible,
      notes: group.children.map((n) => ({
        visible: n.visible,
        position: n.position.toArray(),
        opacity: n.material.opacity,
      })),
    };
  });
try {
  await page.goto(origin);
  await page.waitForFunction(() => window.__appStore);
  await page.evaluate(() => {
    const store = window.__appStore;
    store.getState().completeWelcome('QA', 'Blobby');
    const data = structuredClone(store.getState().data);
    data.market.ownedRoomItems.push('record_player');
    data.room.table = 'record_player';
    data.preferences.showWisdom = false;
    data.preferences.reducedMotion = false;
    data.preferences.pauseScene = false;
    store.getState().restore(data);
    localStorage.setItem(
      'reminduh-sound-v1',
      JSON.stringify({ readThoughts: false, effects: false }),
    );
  });
  await page.goto(origin + '/music');
  const player = page.locator('.record-player');
  await expect(player).toHaveAttribute('data-notes-playing', 'false');
  await page.getByRole('button', { name: 'Play Blobby radio' }).click();
  await expect(player).toHaveAttribute('data-notes-playing', 'true');
  const glyph = page.locator('.record-music-notes > span').first();
  const before = await glyph.evaluate((el) => getComputedStyle(el).transform);
  await page.waitForTimeout(400);
  assert.notEqual(await glyph.evaluate((el) => getComputedStyle(el).transform), before);
  assert.equal(await glyph.evaluate((el) => !!el.closest('[aria-hidden="true"]')), true);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: out + '/player-notes-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Pause record' }).click();
  await expect(player).toHaveAttribute('data-notes-playing', 'false');
  await expect(page.locator('.record-music-notes')).toBeHidden();
  checks.push(
    'Panel notes float only during actual playback, disappear on pause, stay decorative and fit the mobile player.',
  );

  await page.getByRole('button', { name: 'Play Blobby radio' }).click();
  await page.getByRole('link', { name: 'Back to Blobby', exact: true }).click();
  await page.setViewportSize({ width: 1000, height: 1100 });
  await page.waitForSelector('[data-scene-ready="true"]');
  await page.waitForFunction(
    () => window.__assetScene.scene.getObjectByName('Record music notes')?.visible,
  );
  await page.waitForTimeout(1400);
  const moving = await notes();
  await page.waitForTimeout(500);
  const moved = await notes();
  assert.equal(moved.visible, true);
  assert.notDeepEqual(moving.notes[0].position, moved.notes[0].position);
  assert.ok(moved.notes.some((n) => n.opacity > 0.3));
  await page.locator('.companion-card').screenshot({ path: out + '/room-floating-notes.png' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(250);
  const still = await notes();
  await page.waitForTimeout(350);
  assert.deepEqual(await notes(), still);
  assert.equal(still.notes.filter((n) => n.visible).length, 2);
  checks.push(
    'Room notes rise from the turntable; reduced motion replaces movement with two still notes.',
  );

  await page.getByRole('button', { name: 'Sound settings', exact: true }).click();
  const sound = page.getByRole('dialog', { name: 'Sound', exact: true });
  await sound.getByRole('slider', { name: 'Music volume', exact: true }).fill('0');
  await expect.poll(async () => (await notes()).visible).toBe(false);
  await sound.getByRole('slider', { name: 'Music volume', exact: true }).fill('22');
  await expect.poll(async () => (await notes()).visible).toBe(true);
  await sound.getByRole('checkbox', { name: 'Enable audio', exact: true }).uncheck();
  await expect.poll(async () => (await notes()).visible).toBe(false);
  await sound.getByRole('checkbox', { name: 'Enable audio', exact: true }).check();
  await page.getByRole('button', { name: 'Close sound settings', exact: true }).click();
  await page.evaluate(() => {
    const store = window.__appStore;
    store.setState({ data: { ...store.getState().data, hiddenGroups: ['Tea_table'] } });
  });
  await expect.poll(async () => (await notes()).visible).toBe(false);
  checks.push(
    'Room notes disappear when volume is zero, audio is muted or the record-player furniture is hidden.',
  );
  assert.deepEqual(errors, []);
  await writeFile(out + '/results.json', JSON.stringify({ checks, errors }, null, 2));
  console.log(checks.length + ' music-note animation checks passed.');
} finally {
  await browser.close();
}
