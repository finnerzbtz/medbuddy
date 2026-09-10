import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const out = 'rebuild/generated/qa-market';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
  timezoneId: 'Europe/London',
});
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
        updatedAt: '2026-09-06T09:00:00Z',
      }),
    );
});
const page = await context.newPage(),
  checks = [],
  errors = [];
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
try {
  await page.clock.setFixedTime(new Date('2026-09-06T12:00:00+01:00'));
  await page.goto(origin + '/shop');
  await expect(page.getByRole('heading', { name: 'Blobby shop', exact: true })).toBeVisible();
  assert.equal((await data()).market.coins, 120);
  await page.getByRole('button', { name: 'Collect 25 leaves', exact: true }).click();
  assert.equal((await data()).market.coins, 145);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Collected', exact: true })).toBeDisabled();
  assert.equal((await data()).market.coins, 145);
  checks.push(
    'Existing v1 saves receive a starter shop; daily gifts persist and cannot be reclaimed',
  );
  await page.getByRole('button', { name: /Preview Cookie/ }).click();
  await page.getByRole('button', { name: 'Buy for 21 leaves', exact: true }).click();
  await page.getByRole('button', { name: 'Keep browsing', exact: true }).click();
  assert.equal((await data()).market.coins, 145);
  await page.getByRole('button', { name: 'Buy for 21 leaves', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Buy for 21 leaves', exact: true })
    .click();
  assert.equal((await data()).market.coins, 124);
  assert.equal((await data()).market.foods.cookie, 3);
  await audit('food-shop');
  await page.screenshot({ path: out + '/shop-food-desktop.png', fullPage: true });
  checks.push(
    'Purchase review can be cancelled; confirming deducts the exact price and adds a food pack',
  );
  await page.getByRole('button', { name: 'Outfits', exact: true }).click();
  await page.getByRole('button', { name: /Preview Froggy/ }).click();
  await page.waitForTimeout(600);
  assert.equal((await data()).outfit, 'base');
  await page.getByRole('button', { name: 'Buy for 80 leaves', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Buy for 80 leaves', exact: true })
    .click();
  await page.getByRole('button', { name: 'Wear this outfit', exact: true }).click();
  assert.equal((await data()).outfit, 'frog');
  assert.equal((await data()).market.coins, 44);
  await page.screenshot({ path: out + '/shop-outfits-desktop.png', fullPage: true });
  await page.getByRole('button', { name: /Preview Stargazer/ }).click();
  await expect(
    page.getByRole('button', { name: 'Need 56 more leaves', exact: true }),
  ).toBeDisabled();
  await page.reload();
  assert.equal((await data()).outfit, 'frog');
  assert.equal((await data()).market.foods.cookie, 3);
  checks.push(
    'Trying on does not equip or charge; owned outfits equip and persist; insufficient funds are blocked',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /Preview Froggy/ }).click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: out + '/shop-outfits-mobile.png', fullPage: true });
  await audit('outfit-shop-mobile');
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
  }
  checks.push(
    'Shop reflows at 320, 390 and 768 pixels and has no automated accessibility violations',
  );
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(origin + '/?feed=cookie');
  await page.waitForSelector('[data-scene-ready="true"]');
  await page.waitForTimeout(500);
  const snack = page.getByRole('button', { name: 'Select Cookie, 3 available', exact: true });
  const start = await snack.boundingBox();
  assert.ok(
    start.y >= 0 && start.y + start.height < 900,
    'food tray stays visible beside the room',
  );
  const target = await page.locator('.feed-target').boundingBox();
  assert.ok(target && target.width >= 80);
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(12, 200, { steps: 8 });
  await page.mouse.up();
  assert.equal((await data()).market.foods.cookie, 3);
  await expect(page.getByRole('status').filter({ hasText: 'Snack returned' })).toBeVisible();
  await snack.click();
  assert.equal((await data()).market.foods.cookie, 3);
  checks.push('Missed drops and selection do not consume food');
  const beforePosition = await page.evaluate(() => [...window.__assetCharacter.journey.position]);
  const start2 = await snack.boundingBox(),
    target2 = await page.locator('.feed-target').boundingBox();
  await page.mouse.move(start2.x + start2.width / 2, start2.y + start2.height / 2);
  await page.mouse.down();
  await page.mouse.move(target2.x + target2.width / 2, target2.y + target2.height / 2, {
    steps: 15,
  });
  await page.screenshot({ path: out + '/drag-to-feed-mobile.png' });
  await page.mouse.up();
  await expect(page.locator('.companion-card')).toHaveAttribute('data-state', 'feeding');
  assert.equal((await data()).market.foods.cookie, 2);
  assert.deepEqual(
    await page.evaluate(() => window.__assetCharacter.journey.position),
    beforePosition,
  );
  await page.waitForTimeout(1100);
  await page.screenshot({ path: out + '/first-bite-mobile.png' });
  const first = await page.evaluate(() => ({
    time: window.__assetCharacter.journey.actionTime,
    scale: window.__assetScene.scene.getObjectByName('Blobby_snack').scale.x,
  }));
  await page.waitForTimeout(1900);
  const last = await page.evaluate(() => ({
    time: window.__assetCharacter.journey.actionTime,
    scale: window.__assetScene.scene.getObjectByName('Blobby_snack').scale.x,
  }));
  assert.ok(last.time > first.time && last.scale < first.scale);
  await expect
    .poll(() => page.evaluate(() => window.__appStore.getState().currentAnimation), {
      timeout: 12000,
    })
    .toBe('idle');
  checks.push(
    'A successful drag consumes once and eats in place, with timed bites and automatic completion',
  );
  await page.clock.setFixedTime(new Date('2026-09-06T12:00:20+01:00'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Select Apple, 3 available', exact: true }).focus();
  await page.keyboard.press('Enter');
  const feed = page.getByRole('button', { name: 'Feed Apple', exact: true });
  await feed.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.companion-card')).toHaveAttribute('data-state', 'feeding');
  await page.waitForTimeout(100);
  const bones = await page.evaluate(() =>
    (() => {
      const bones = [];
      window.__assetCharacter.object.traverse((node) => {
        if (node.isBone) bones.push(node.quaternion.toArray());
      });
      return bones;
    })(),
  );
  await page.waitForTimeout(400);
  assert.deepEqual(
    await page.evaluate(() =>
      (() => {
        const bones = [];
        window.__assetCharacter.object.traverse((node) => {
          if (node.isBone) bones.push(node.quaternion.toArray());
        });
        return bones;
      })(),
    ),
    bones,
  );
  await expect
    .poll(() => page.evaluate(() => window.__appStore.getState().currentAnimation), {
      timeout: 6000,
    })
    .toBe('idle');
  await audit('food-tray');
  checks.push(
    'Keyboard feeding and OS reduced motion complete without requiring dragging or animation',
  );
  await page.clock.setFixedTime(new Date('2026-09-06T12:00:40+01:00'));
  await page.evaluate(() => window.__appStore.getState().setPreference('staticScene', true));
  await page.getByRole('button', { name: 'Select Apple, 2 available', exact: true }).click();
  await page.getByRole('button', { name: 'Feed Apple', exact: true }).click();
  assert.equal((await data()).care.days['2026-09-06'].spent, 2);
  assert.equal((await data()).market.foods.cookie, 2);
  assert.deepEqual((await data()).records, {});
  assert.deepEqual((await data()).medications, []);
  checks.push('Static mode retains tap feeding; shop and feeding never alter medication data');
  await page.clock.setFixedTime(new Date('2026-09-06T12:01:00+01:00'));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    window.__appStore.getState().react('idle');
    window.__appStore.getState().setPreference('staticScene', false);
  });
  await page.waitForSelector('[data-scene-ready="true"]');
  await page.waitForTimeout(300);
  await page.locator('.home-scene').scrollIntoViewIfNeeded();
  const touchSnack = page.getByRole('button', { name: 'Select Apple, 1 available', exact: true });
  await touchSnack.scrollIntoViewIfNeeded();
  const ts = await touchSnack.boundingBox(),
    tt = await page.locator('.feed-target').boundingBox();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const touch = (type, x, y) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, id: 0 }],
    });
  await touch('touchStart', ts.x + ts.width / 2, ts.y + ts.height / 2);
  await touch('touchMove', tt.x + tt.width / 2, tt.y + tt.height / 2);
  await touch('touchCancel', 0, 0);
  assert.equal((await data()).care.days['2026-09-06'].spent, 2);
  await touch('touchStart', ts.x + ts.width / 2, ts.y + ts.height / 2);
  await touch('touchMove', tt.x + tt.width / 2, tt.y + tt.height / 2);
  await touch('touchEnd', 0, 0);
  await expect(page.locator('.companion-card')).toHaveAttribute('data-state', 'feeding');
  assert.equal((await data()).care.days['2026-09-06'].spent, 3);
  checks.push('Real touch drag feeds once; pointer cancellation keeps the snack');
  assert.deepEqual(errors, []);
  await writeFile(out + '/results.json', JSON.stringify({ status: 'passed', checks }, null, 2));
  console.log(checks.length + ' marketplace and feeding checks passed.');
} catch (e) {
  await page.screenshot({ path: out + '/failure.png', fullPage: true });
  throw e;
} finally {
  await browser.close();
}
