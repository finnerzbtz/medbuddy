import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const out = 'rebuild/generated/qa-celebration';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  timezoneId: 'Europe/London',
  reducedMotion: 'no-preference',
});
const page = await context.newPage(),
  checks = [],
  errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const origin = process.env.MVP_TEST_URL ?? 'http://127.0.0.1:5177';
const check = (name) => {
  checks.push(name);
  console.log('PASS', name);
};
const state = () =>
  page.evaluate(() => ({
    data: window.__appStore.getState().data,
    moment: window.__appStore.getState().celebration,
    reactionId: window.__appStore.getState().reactionId,
  }));
async function setup(preference, route = '/') {
  await page.goto(origin + '/profile');
  await page.waitForFunction(() => window.__appStore);
  await page.evaluate((preference) => {
    const s = window.__appStore.getState();
    s.reset();
    s.completeWelcome('Alex', 'Blobby');
    s.setOutfit('sweater');
    if (preference) s.setPreference(preference, true);
    s.saveMedication({
      name: 'Example medicine',
      strengthMg: 10,
      tabletsPerDose: 1,
      instructions: '',
      color: '#738962',
      times: ['08:00', '10:00'],
      days: [0, 1, 2, 3, 4, 5, 6],
      startDate: '2026-09-06',
      supply: 12,
      refillAt: 3,
    });
  }, preference);
  await page.goto(origin + route);
  await expect(page.locator('.dose-card')).toHaveCount(2);
}
async function record(index = 0, skip = false) {
  await page.locator('.dose-card').nth(index).click();
  if (skip) {
    await page.getByRole('button', { name: 'Record a skip', exact: true }).click();
    await page.getByRole('button', { name: 'Record as skipped', exact: true }).click();
  } else await page.getByRole('button', { name: 'I’ve taken this dose', exact: true }).click();
}
async function audit(label) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await writeFile(out + '/' + label + '-axe.json', JSON.stringify(results.violations, null, 2));
  assert.deepEqual(
    results.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
    [],
    label,
  );
}
try {
  await page.clock.setFixedTime(new Date('2026-09-06T12:00:00+01:00'));
  await setup();
  await page.waitForSelector('[data-scene-ready="true"]');
  await page.evaluate(() => {
    window.__originalRoom = window.__assetScene;
    window.__originalCharacter = window.__assetCharacter;
  });
  const market = (await state()).data.market;
  await record();
  await expect(page.locator('.dose-celebration')).toBeVisible();
  await expect(page.locator('.dose-celebration-blobby')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.dose-celebration h2')).toHaveText('Dose recorded!');
  await expect(page.locator('.dose-card').first()).toBeFocused();
  await page.waitForTimeout(750);
  await page.screenshot({ path: out + '/celebration-desktop.png' });
  assert.equal(await page.locator('.dose-confetti > span').count(), 64);
  assert.equal(
    await page.locator('.dose-celebration').evaluate((el) => getComputedStyle(el).pointerEvents),
    'none',
  );
  const rewarded = (await state()).data.market;
  assert.equal(rewarded.coins, market.coins + 10);
  assert.equal(Object.values(rewarded.checkInRewards).filter((v) => v === 10).length, 1);
  await expect(page.getByText('+10 leaves', { exact: true })).toBeVisible();
  check(
    'A real UI check-in shows the 3D cheer and full-screen confetti without stealing focus, and awards ten leaves',
  );
  await expect(page.locator('.dose-celebration')).toHaveCount(0, { timeout: 6000 });
  await expect(page.getByRole('status').filter({ hasText: 'Dose recorded.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  assert.equal(
    await page.evaluate(
      () =>
        window.__originalRoom === window.__assetScene &&
        window.__originalCharacter === window.__assetCharacter,
    ),
    true,
  );
  check(
    'The flourish ends automatically; confirmation, Undo and the existing room remain available',
  );
  await audit('confirmation-desktop');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.equal(Object.keys((await state()).data.records).length, 0);
  check('Undo removes the recorded dose after the celebration has ended');

  await page.setViewportSize({ width: 390, height: 844 });
  await record();
  await expect(page.locator('.dose-celebration-blobby')).toHaveAttribute('data-ready', 'true');
  await page.waitForTimeout(650);
  await page.screenshot({ path: out + '/celebration-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('.dose-celebration')).toHaveCount(0);
  await expect(page.locator('.dose-card').first()).toBeFocused();
  check('Mobile celebration is visible above the room; Escape skips it and retains check-in focus');
  const reaction = (await state()).reactionId;
  await page.locator('.dose-card').first().click();
  await page.getByLabel('Note').fill('Updated note');
  await page.getByRole('button', { name: 'Save as taken', exact: true }).click();
  await expect(page.locator('.dose-celebration')).toHaveCount(0);
  assert.equal((await state()).reactionId, reaction);
  await page.reload();
  await expect(page.locator('.dose-card')).toHaveCount(2);
  await expect(page.locator('.dose-celebration')).toHaveCount(0);
  assert.equal(Object.keys((await state()).data.records).length, 1);
  check('Editing a check-in or reloading the app never replays the celebration');

  await record(1, true);
  await expect(page.locator('.dose-celebration h2')).toHaveText('All checked in!');
  await expect(page.getByRole('status').filter({ hasText: 'Recorded as skipped.' })).toBeVisible();
  await expect(page.locator('.dose-celebration-blobby')).toHaveAttribute('data-ready', 'true');
  await page.waitForTimeout(650);
  await page.screenshot({ path: out + '/all-checked-in-mobile.png' });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.dose-celebration')).toHaveCount(0);
  assert.equal(Object.keys((await state()).data.records).length, 1);
  check(
    'The final check-in celebrates completion with honest skip wording; Undo works during the flourish',
  );

  await setup();
  await record();
  await page.locator('.dose-card').nth(1).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.dose-celebration')).toHaveCount(0);
  await page.keyboard.press('Escape');
  check('The next tap dismisses the visual and reaches the intended control in the same action');

  for (const pref of ['reducedMotion', 'staticScene', 'pauseScene', 'hideRewards']) {
    await setup(pref);
    await record();
    await expect(page.locator('.dose-celebration')).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: 'Dose recorded.' })).toBeVisible();
    assert.equal(Object.keys((await state()).data.records).length, 1);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup();
  await record();
  await expect(page.locator('.dose-celebration')).toHaveCount(0);
  await audit('calm-confirmation-mobile');
  await page.screenshot({ path: out + '/calm-confirmation-mobile.png' });
  check(
    'OS and in-app reduced motion, paused/still scenes and hidden rewards use calm persistent feedback',
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await setup();
  const beforePreview = (await state()).data;
  await page.getByRole('button', { name: 'Cheat codes', exact: true }).click();
  await page.getByRole('button', { name: 'Preview check-in celebration', exact: true }).click();
  await expect(page.locator('.dose-celebration h2')).toHaveText('Celebration preview');
  await expect(page.getByRole('status').filter({ hasText: 'No dose was recorded.' })).toBeVisible();
  assert.deepEqual((await state()).data, beforePreview);
  await page.keyboard.press('Escape');
  check('Cheat-code preview is clearly labelled and leaves all saved data unchanged');

  for (const [width, height] of [
    [320, 568],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await setup(undefined, '/log');
    await record();
    await expect(page.locator('.dose-celebration-blobby')).toHaveAttribute('data-ready', 'true');
    const fits = await page.locator('.dose-celebration-stage').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
    });
    assert.ok(fits, 'stage fits ' + width + 'x' + height);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.keyboard.press('Escape');
  }
  check('The celebration also works from History and fits narrow phones and landscape screens');
  assert.deepEqual(errors, []);
  await writeFile(out + '/results.json', JSON.stringify({ status: 'passed', checks }, null, 2));
  console.log(checks.length + ' celebration checks passed.');
} catch (error) {
  await page.screenshot({ path: out + '/failure.png', fullPage: true }).catch(() => {});
  await writeFile(
    out + '/results.json',
    JSON.stringify({ status: 'failed', checks, error: String(error), errors }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
