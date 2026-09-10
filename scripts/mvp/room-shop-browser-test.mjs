import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const out = 'rebuild/generated/qa-room-shop';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  timezoneId: 'Europe/London',
});
const page = await context.newPage(),
  errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(String(e)));
const origin = process.env.MVP_TEST_URL ?? 'http://127.0.0.1:5177';
const data = async () => {
  await page.waitForFunction(() => window.__appStore);
  return page.evaluate(() => window.__appStore.getState().data);
};
const audit = async (label) => {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await writeFile(out + '/' + label + '-axe.json', JSON.stringify(result.violations, null, 2));
  assert.deepEqual(
    result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    [],
    label,
  );
};
const snapshot = () =>
  page.evaluate(() => {
    const scene = window.__assetScene.scene,
      items = {},
      original = {},
      celestial = {},
      wax = [];
    scene.traverse((n) => {
      let visible = true;
      for (let at = n; at; at = at.parent) if (!at.visible) visible = false;
      if (n.userData.room_item) {
        (items[n.userData.room_item] ??= []).push(visible);
        if (n.userData.room_celestial)
          celestial[n.userData.room_item + '.' + n.userData.room_celestial] = visible;
        if (n.userData.room_motion === 'lava') {
          const mats = Array.isArray(n.material) ? n.material : [n.material];
          wax.push({ position: n.position.toArray(), glow: mats.map((m) => m.emissiveIntensity) });
        }
      } else if (
        ['Bonsai', 'Tea_table', 'Tea_cup', 'Books', 'Lamp', 'Garden', 'Watering_can'].includes(
          n.userData.asset_group,
        )
      ) {
        (original[n.userData.asset_group] ??= []).push(visible);
      }
    });
    return {
      items,
      original,
      celestial,
      wax,
      lamp: scene.getObjectByName('Room_lamp').intensity,
      calls: window.__assetScene.renderer.info.render.calls,
    };
  });
const buy = async (area, name, price) => {
  await page.getByRole('button', { name: area, exact: true }).click();
  const card = page.getByRole('article', { name, exact: true });
  await card
    .getByRole('button', { name: `Buy and use ${name} for ${price} leaves`, exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: `Buy & use ${price} leaves`, exact: true })
    .click();
  await expect(card.getByText('In your room', { exact: true })).toBeVisible();
  await expect(card.locator('.room-in-use')).toBeFocused();
};
const sand = page.getByRole('button', { name: 'Zen: Rake the Zen garden', exact: true });
const music = page.getByRole('button', { name: 'Music: Open record player', exact: true });
try {
  await page.clock.setFixedTime(new Date('2026-09-06T12:00:00+01:00'));
  await page.goto(origin);
  await page.waitForFunction(() => window.__appStore);
  const seeded = await page.evaluate(() => {
    window.__appStore.getState().completeWelcome('Alex', 'Blobby');
    const d = structuredClone(window.__appStore.getState().data);
    d.market.coins = 400;
    return window.__appStore.getState().restore(d);
  });
  assert.equal(seeded.ok, true);
  await page.goto(origin + '/shop?tab=room');
  const original = await data();
  await page.getByRole('button', { name: /^Preview Zen garden/ }).click();
  await page.waitForTimeout(500);
  assert.deepEqual((await data()).room, original.room);
  await expect(page.getByRole('dialog', { name: 'Preview Zen garden' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Preview Zen garden', exact: true })).toBeFocused();
  await page
    .getByRole('button', { name: 'Buy and use Zen garden for 60 leaves', exact: true })
    .click();
  await page.getByRole('button', { name: 'Keep browsing', exact: true }).click();
  assert.equal((await data()).market.coins, 400);
  await buy('Garden', 'Zen garden', 60);
  await buy('Table', 'Vinyl corner', 70);
  await buy('Lamps', 'Lavender lava', 45);
  await buy('View', 'Seaside daydream', 40);
  assert.equal((await data()).market.coins, 185);
  assert.deepEqual((await data()).room, {
    garden: 'sand_garden',
    table: 'record_player',
    lamp: 'lava_lamp',
    view: 'coast_view',
  });
  await page.reload();
  await expect(page.getByText('In your room', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Garden', exact: true }).click();
  await page.getByRole('button', { name: 'Use Little bonsai in room', exact: true }).click();
  assert.equal((await data()).room.garden, 'bonsai');
  await page.getByRole('button', { name: 'Use Zen garden in room', exact: true }).click();
  assert.equal((await data()).market.coins, 185);
  checks.push(
    'Previews and cancelled purchases leave the save unchanged; four confirmed purchases charge exactly once, equip independently, persist, and owned pieces swap for free',
  );
  await page.evaluate(() => window.__appStore.getState().dismissToast());
  await audit('room-shop-desktop');
  await page.screenshot({ path: out + '/shop-room-desktop.png', fullPage: true });
  for (const width of [320, 390, 540, 700, 768]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await audit('room-shop-mobile');
  await page.screenshot({ path: out + '/shop-room-mobile.png', fullPage: true });
  assert.equal(
    await page.locator('.shop-detail').count(),
    0,
    'No oversized detail panel ahead of choices',
  );
  const choices = await page
    .locator('.room-item-card')
    .evaluateAll((cards) => cards.map((el) => el.getBoundingClientRect().top));
  assert.ok(
    choices[0] < 450 && choices[1] < 700,
    'Both garden choices are reachable near the top on mobile',
  );
  await page.getByRole('button', { name: 'Preview Little bonsai', exact: true }).click();
  await expect(page.locator('.room-preview-frame')).toHaveAttribute('data-preview-ready', 'true', {
    timeout: 15000,
  });
  await audit('room-preview-mobile');
  await page.screenshot({ path: out + '/room-preview-mobile.png' });
  for (const width of [320, 540]) {
    await page.setViewportSize({ width, height: 798 });
    const geometry = await page.locator('dialog.room-item-preview').evaluate((el) => ({
      left: el.getBoundingClientRect().left,
      top: el.getBoundingClientRect().top,
      right: el.getBoundingClientRect().right,
      bottom: el.getBoundingClientRect().bottom,
      overflow: el.scrollWidth > el.clientWidth,
    }));
    assert.ok(
      geometry.left >= 11 &&
        geometry.top >= 15 &&
        geometry.right <= width - 11 &&
        geometry.bottom <= 798 &&
        !geometry.overflow,
    );
  }
  await page.getByRole('button', { name: 'Back to items', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Preview Little bonsai', exact: true }),
  ).toBeFocused();
  checks.push(
    'Room choices stay above the optional daily gift, reflow from 320 pixels, and optional previews are bounded dialogs with keyboard focus restored; shop and preview pass automated accessibility scans',
  );
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto(origin);
  await page.waitForSelector('[data-scene-ready="true"]');
  await expect.poll(async () => Object.keys((await snapshot()).items).length).toBe(6);
  await page.evaluate(() => window.__appStore.getState().previewState('idle'));
  const first = await snapshot();
  for (const id of ['sand_garden', 'record_player', 'lava_lamp', 'coast_view'])
    assert.ok(first.items[id].some(Boolean), id);
  for (const id of ['mushroom_lamp', 'mountain_view'])
    assert.ok(
      first.items[id].every((v) => !v),
      id,
    );
  for (const [key, visible] of Object.entries(first.original))
    assert.ok(
      visible.every((v) => !v),
      key + ' originals hidden',
    );
  assert.ok(first.calls < 100);
  assert.equal(first.celestial['coast_view.sun'], true);
  assert.equal(first.celestial['coast_view.moon'], false);
  await page.waitForTimeout(650);
  assert.notDeepEqual((await snapshot()).wax, first.wax);
  await page.locator('.companion-card').screenshot({ path: out + '/collection-room-desktop.png' });
  await page.getByRole('button', { name: 'Turn lamp off', exact: true }).click();
  await expect.poll(async () => (await snapshot()).lamp).toBe(0);
  const off = await snapshot();
  assert.ok(off.wax.every((w) => w.glow.every((g) => g === 0)));
  await page.waitForTimeout(450);
  assert.deepEqual((await snapshot()).wax, off.wax);
  await page.getByRole('button', { name: 'Turn lamp on', exact: true }).click();
  await expect.poll(async () => (await snapshot()).lamp).toBeGreaterThan(0);
  await page.evaluate(() => window.__appStore.getState().setPreviewPaused(true));
  await page.waitForTimeout(100);
  const paused = await snapshot();
  await page.waitForTimeout(400);
  assert.deepEqual((await snapshot()).wax, paused.wax);
  await page.evaluate(() => window.__appStore.getState().setPreviewPaused(false));
  checks.push(
    'Only equipped props render; original props are removed; animated lava respects the real lamp switch and pause; room stays below 100 draw calls',
  );
  const beforeGames = await data();
  await sand.click();
  await expect(page.locator('.live-scene')).toHaveAttribute('data-room-game-stage', 'approach');
  assert.equal(await page.locator('dialog.room-game').count(), 0);
  const position = await page.evaluate(() => [...window.__assetCharacter.journey.position]);
  await page.waitForTimeout(450);
  assert.notDeepEqual(
    await page.evaluate(() => [...window.__assetCharacter.journey.position]),
    position,
  );
  await expect(page.locator('dialog.room-game')).toBeVisible({ timeout: 12000 });
  await expect(page.locator('.live-scene')).toHaveAttribute('data-room-game-stage', 'film');
  await audit('sand-game');
  await expect(page.locator('[data-sand-ready="true"]')).toBeVisible();
  const sandCanvas = page.locator('.sensory-sand-board');
  const beforeSand = await sandCanvas.evaluate((canvas) => canvas.toDataURL());
  const box = await sandCanvas.boundingBox();
  const points = Array.from({ length: 65 }, (_, i) => {
    const a = (i / 64) * Math.PI * 2;
    return [
      box.x + box.width / 2 + Math.cos(a) * box.width * 0.2,
      box.y + box.height / 2 + Math.sin(a) * box.height * 0.2,
    ];
  });
  await page.mouse.move(...points[0]);
  await page.mouse.down();
  for (const point of points.slice(1)) await page.mouse.move(...point);
  await page.mouse.up();
  assert.ok(
    await sandCanvas.evaluate((canvas, before) => canvas.toDataURL() !== before, beforeSand),
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.ok(
    await sandCanvas.evaluate((canvas, before) => canvas.toDataURL() === before, beforeSand),
  );
  await page.getByText('Tools & keyboard', { exact: true }).click();
  await page.getByRole('button', { name: 'Draw a spiral', exact: true }).click();
  await page.screenshot({ path: out + '/zen-game-desktop.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.room-game')).toHaveCount(0);
  await expect(sand).toBeFocused();
  checks.push(
    'Blobby walks to the installed Zen garden before its freeform sand surface opens; real pointer strokes, undo and the accessible spiral control work, and leaving restores focus',
  );
  await music.click();
  await expect(page.locator('.live-scene')).toHaveAttribute('data-room-game-stage', 'approach');
  await expect(page.locator('dialog.room-game')).toBeVisible({ timeout: 12000 });
  await page.getByRole('button', { name: 'Make a melody', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sound off', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.getByRole('button', { name: 'Play La', exact: true }).click();
  await expect(page.locator('.melody-game')).toHaveAttribute('data-step', '0');
  await page.getByRole('button', { name: 'Sound off', exact: true }).click();
  await page.getByRole('button', { name: 'Hear pattern', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hear pattern', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Sound on', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hear pattern', exact: true })).toHaveCount(0);
  await audit('melody-game');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: out + '/melody-game-mobile.png' });
  for (const [i, sequence] of [
    ['Do', 'Mi', 'Sol'],
    ['Sol', 'Mi', 'Do', 'La'],
    ['Do', 'Sol', 'La', 'Mi', 'Do'],
  ].entries()) {
    for (const name of sequence) {
      await page.getByRole('button', { name: 'Play ' + name, exact: true }).focus();
      await page.keyboard.press('Enter');
    }
    if (i < 2) {
      await expect(page.getByRole('button', { name: 'Next melody', exact: true })).toBeFocused();
      await page.keyboard.press('Enter');
    }
  }
  await expect(
    page.getByRole('heading', { name: 'Your little mixtape.', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(music).toBeFocused();
  const afterGames = await data();
  for (const key of ['market', 'medications', 'records', 'room', 'care'])
    assert.deepEqual(afterGames[key], beforeGames[key], key + ' unchanged by games');
  checks.push(
    'Vinyl corner opens an untimed melody game after travel; wrong notes preserve progress, sound starts muted and cancels promptly, all rounds work by keyboard without changing medication or purchases',
  );
  await page.evaluate(() => window.__appStore.getState().setPreference('staticScene', true));
  await sand.click();
  await expect(page.locator('dialog.room-game')).toBeVisible();
  await page.waitForTimeout(14500);
  await expect(page.locator('dialog.room-game')).toBeVisible();
  await page.setViewportSize({ width: 320, height: 798 });
  assert.equal(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth > innerWidth ||
        document.querySelector('dialog').scrollWidth > innerWidth,
    ),
    false,
  );
  await audit('static-sand-mobile');
  await page.keyboard.press('Escape');
  await expect(sand).toBeFocused();
  await music.click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('dialog.room-game')).toBeVisible();
  await page.getByRole('button', { name: 'Make a melody', exact: true }).click();
  assert.equal(
    await page.locator('.mixtape-record').evaluate((el) => getComputedStyle(el).animationName),
    'none',
  );
  assert.equal(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth > innerWidth ||
        document.querySelector('dialog').scrollWidth > innerWidth,
    ),
    false,
  );
  await audit('static-melody-mobile');
  await page.keyboard.press('Escape');
  checks.push(
    'Both games remain available in still-image mode, do not time out, respect reduced motion, fit 320 pixels and pass mobile accessibility scans',
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => window.__appStore.getState().setPreference('staticScene', false));
  await page.goto(origin + '/shop?tab=room&slot=lamp');
  await buy('Lamps', 'Mushroom glow', 50);
  await buy('View', 'Alpine escape', 40);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto(origin);
  await page.waitForSelector('[data-scene-ready="true"]');
  await expect.poll(async () => (await snapshot()).items.mushroom_lamp?.some(Boolean)).toBe(true);
  await expect.poll(async () => (await snapshot()).items.mountain_view?.some(Boolean)).toBe(true);
  assert.ok((await snapshot()).items.lava_lamp.every((v) => !v));
  await page.clock.setFixedTime(new Date('2026-09-06T23:00:00+01:00'));
  await expect
    .poll(async () => (await snapshot()).celestial['mountain_view.moon'], { timeout: 15000 })
    .toBe(true);
  assert.equal((await snapshot()).celestial['mountain_view.sun'], false);
  await page.locator('.companion-card').screenshot({ path: out + '/alpine-night-room.png' });
  await page.reload();
  await page.waitForSelector('[data-scene-ready="true"]');
  assert.equal((await data()).room.lamp, 'mushroom_lamp');
  await page.goto(origin + '/profile');
  await expect(page.getByLabel('Mushroom glow', { exact: true })).toBeChecked();
  await page.getByLabel('Mushroom glow', { exact: true }).uncheck();
  await page.goto(origin);
  await page.waitForSelector('[data-scene-ready="true"]');
  await expect.poll(async () => (await snapshot()).items.mushroom_lamp?.some(Boolean)).toBe(false);
  assert.equal((await snapshot()).lamp, 0);
  checks.push(
    'Mushroom lamp and alpine view replace their counterparts, night changes the sky and celestial objects, reload keeps the choices, and room visibility controls use the installed name',
  );
  assert.deepEqual(errors, []);
  checks.push('No browser runtime errors');
  await writeFile(out + '/results.json', JSON.stringify({ status: 'passed', checks }, null, 2));
  console.log(checks.length + ' room customisation browser checks passed.');
} catch (e) {
  await page.screenshot({ path: out + '/failure.png', fullPage: true });
  console.error('Completed checks:', checks);
  throw e;
} finally {
  await browser.close();
}
