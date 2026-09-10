import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin = process.env.MVP_TEST_URL ?? 'http://127.0.0.1:5177',
  out = process.env.A11Y_TEST_OUT ?? 'rebuild/generated/qa-accessibility';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
const context = await browser.newContext({
  viewport: { width: 1280, height: 1000 },
  timezoneId: 'Europe/London',
});
const page = await context.newPage(),
  checks = [],
  errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const check = (name) => {
  checks.push(name);
  console.log('PASS', name);
};
await page.clock.setFixedTime(new Date('2026-09-05T12:00:00+01:00'));
try {
  await page.goto(origin + '/welcome');
  await page.getByRole('link', { name: 'Help & accessibility settings' }).click();
  await expect(page).toHaveURL(/help/);
  await expect(page.locator('#main-content')).toBeFocused();
  check('Help is available before onboarding; navigation moves focus and updates title');
  await expect(page).toHaveTitle('Help & accessibility · Reminduh');
  await page.evaluate(() => {
    const s = window.__appStore.getState();
    s.completeWelcome('Alex', 'Blobby');
    s.saveMedication({
      name: 'Example medicine',
      strengthMg: 10,
      tabletsPerDose: 1,
      instructions: 'With breakfast',
      color: '#738962',
      times: ['08:00', '20:00'],
      days: [0, 1, 2, 3, 4, 5, 6],
      startDate: '2026-09-05',
      supply: 30,
      refillAt: 5,
    });
  });
  await page.goto(origin + '/');
  await page.waitForSelector('[data-scene-ready="true"]');
  await page.getByRole('button', { name: 'Pause room animation', exact: true }).click();
  const before = await page.evaluate(() => window.__assetCharacter.mixer.time);
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => window.__assetCharacter.mixer.time), before);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Resume room animation' })).toBeVisible();
  check('Visible room pause stops animation and survives reload');
  await page.getByRole('link', { name: 'Help', exact: true }).click();
  await page.getByRole('button', { name: 'Use calm settings' }).click();
  await expect(page.getByRole('checkbox', { name: 'Gentle moods', exact: true })).toBeChecked();
  await page.goto(origin + '/');
  await expect(page.locator('.friendship-row')).toHaveCount(0);
  await expect(page.locator('.care-goals')).toHaveCount(0);
  await expect(page.locator('.companion-card')).toHaveAttribute('data-state', 'idle');
  await expect(page.getByRole('button', { name: 'Check in now', exact: true })).toBeVisible();
  check('Calm preset hides scores and low moods without hiding medication check-ins');
  await page.getByRole('button', { name: 'Check in now', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Record a skip', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Record as skipped', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Check in now', exact: true })).toBeFocused();
  check('Check-in skip confirmation and Escape preserve keyboard focus');
  if (await page.getByRole('button', { name: 'Dismiss message' }).count())
    await page.getByRole('button', { name: 'Dismiss message' }).click();
  await page.getByRole('button', { name: 'Garden: Tend the bonsai', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('.garden-cutscene');
  const shower = page.getByRole('button', { name: 'Shower the tree', exact: true });
  await shower.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Garden: Tend the bonsai', exact: true }),
  ).toBeFocused();
  check('Sensory bonsai works with one keyboard press, no timing, and returns focus to the room');
  await page.getByRole('link', { name: 'History', exact: true }).click();
  const current = page.locator('[data-calendar-day="2026-09-05"]');
  await current.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-calendar-day="2026-09-04"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-calendar-day="2026-09-04"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  assert.equal(await page.locator('.calendar-day[tabindex="0"]').count(), 1);
  check('History uses one calendar tab stop and arrow-key navigation');
  await page.goto(origin + '/meds/new');
  await page
    .getByRole('combobox', { name: 'Medication name', exact: true })
    .fill('Another medicine');
  await page.getByRole('spinbutton', { name: 'Strength per tablet (mg)', exact: true }).fill('0');
  await page.getByRole('spinbutton', { name: 'Number of tablets per dose', exact: true }).fill('1');
  await page.getByRole('button', { name: 'Add medication', exact: true }).click();
  await expect(page.locator('.form-error')).toBeFocused();
  await page.locator('.form-error a').click();
  await expect(page.locator('#med-strengthMg')).toBeFocused();
  check('Form error summary focuses and links to the field to correct');
  await page.getByRole('button', { name: 'Add another time', exact: true }).click();
  await expect(page.locator('#med-time-1')).toBeFocused();
  await page.getByRole('button', { name: 'Remove time 2' }).click();
  await expect(page.locator('#med-time-0')).toBeFocused();
  check('Adding and removing reminder times keeps a meaningful keyboard focus');
  await page.evaluate(() =>
    window.__appStore.getState().showToast('A confirmation stays until you dismiss it.'),
  );
  await page.waitForTimeout(11000);
  await expect(
    page.getByText('A confirmation stays until you dismiss it.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss message' }).click();
  check('Status messages have no reading deadline');
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: width === 320 ? 800 : 900 });
    for (const route of ['/', '/meds', '/meds/new', '/log', '/profile', '/help']) {
      await page.goto(origin + route);
      const overflow = await page.evaluate(() => ({
        w: innerWidth,
        sw: document.documentElement.scrollWidth,
      }));
      assert.ok(overflow.sw <= overflow.w + 1, JSON.stringify({ width, route, overflow }));
    }
  }
  check('All main routes reflow at 320, 390 and 768 CSS pixels without horizontal scrolling');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + '/');
  await page.waitForSelector('[data-scene-ready="true"]');
  await page.screenshot({ path: out + '/calm-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Garden: Tend the bonsai', exact: true }).click();
  await page.waitForSelector('.garden-cutscene');
  await page.screenshot({ path: out + '/garden-mobile.png' });
  await page.keyboard.press('Escape');
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto(origin + '/meds/new');
  await page.getByRole('combobox', { name: 'Medication name', exact: true }).focus();
  await page.screenshot({ path: out + '/forced-colors.png', fullPage: true });
  await page.emulateMedia({ forcedColors: 'none' });
  await page.addStyleTag({
    content:
      '* { line-height:1.5 !important; letter-spacing:.12em !important; word-spacing:.16em !important; } p { margin-bottom:2em !important; }',
  });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: out + '/text-spacing.png', fullPage: true });
  check('Medication form supports forced colors and text-spacing overrides at mobile width');
  await page.setViewportSize({ width: 320, height: 256 });
  await page.goto(origin + '/');
  // Deliberately choose Garden before awaiting the lazy 3D renderer.
  await page.getByRole('button', { name: 'Garden: Tend the bonsai', exact: true }).click();
  await page.waitForSelector('.bonsai-garden[data-ready="true"]');
  await page.getByRole('button', { name: 'Shower the tree', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  for (const button of await page.locator('.bonsai-garden button:not(:disabled)').all()) {
    await button.focus();
    const rect = await button.boundingBox();
    assert.ok(
      rect &&
        rect.x >= 0 &&
        rect.y >= 0 &&
        rect.x + rect.width <= 321 &&
        rect.y + rect.height <= 257,
    );
  }
  await page.screenshot({ path: out + '/garden-400-percent.png' });
  await page.keyboard.press('Escape');
  check('Garden opens before 3D loading completes and all controls remain reachable at 320×256');
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.evaluate(() => {
    const s = window.__appStore.getState();
    s.setPreference('reducedMotion', false);
    s.setPreference('pauseScene', false);
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(origin + '/');
  await page.waitForSelector('[data-scene-ready="true"]');
  await page.waitForTimeout(200);
  const motionTime = await page.evaluate(() => window.__assetCharacter.mixer.time);
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__assetCharacter.mixer.time), motionTime);
  check('Device reduced-motion preference stops animation even when the in-app setting is off');
  await page.goto(origin + '/studio');
  await page.waitForFunction(() => window.__assetScene);
  const cameraBefore = await page.evaluate(() => window.__assetScene.camera.position.toArray());
  await page.getByRole('button', { name: 'Rotate left', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  assert.notDeepEqual(
    await page.evaluate(() => window.__assetScene.camera.position.toArray()),
    cameraBefore,
  );
  check('Studio camera rotates using keyboard buttons without dragging');
  assert.deepEqual(errors, []);
  check('No uncaught browser errors');
} finally {
  await writeFile(out + '/checks.json', JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
}
