import { chromium, webkit, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const base = process.env.REFINEMENT_URL ?? process.env.MOBILE_TEST_URL ?? 'http://127.0.0.1:5193';
await mkdir('/tmp/reminduh-refinement', { recursive: true });
for (const [name, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/profile');
    await page.waitForFunction(() => window.__appStore);
    await page.evaluate(() => {
      const s = window.__appStore.getState();
      s.completeWelcome('Finn', 'Blobby');
      s.setPreference('staticScene', true);
    });
    await page.goto(base + '/');
    await expect(page.getByRole('button', { name: 'Activities', exact: true })).toBeVisible();
    await expect(page.locator('#room-activities')).toBeHidden();
    await expect(page.locator('.room-controls')).toHaveCount(0);
    await expect(page.locator('.companion-actions').getByRole('button')).toHaveCount(4);
    const health = () =>
      page.evaluate(() => {
        const d = window.__appStore.getState().data;
        return JSON.stringify([d.medications, d.records, d.reminders]);
      });
    const before = await health();
    await page.getByRole('button', { name: 'Room options', exact: true }).click();
    const tools = page.locator('#room-tools');
    await expect(tools.getByRole('button', { name: /Turn lamp/ })).toBeVisible();
    const lamp = tools.getByRole('button', { name: /Turn lamp/ });
    const pressed = await lamp.getAttribute('aria-pressed');
    await lamp.click();
    await expect(lamp).toHaveAttribute('aria-pressed', pressed === 'true' ? 'false' : 'true');
    await lamp.focus();
    await page.keyboard.press('Escape');
    await expect(tools).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Room options', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Activities', exact: true }).click();
    await expect(page.locator('#room-activities').getByRole('button')).toHaveCount(4);
    await page
      .locator('#room-activities')
      .getByRole('button', { name: /Window:/ })
      .click();
    assert.equal(
      await health(),
      before,
      'Room controls never record medication or alter reminders',
    );
    await page.getByRole('button', { name: 'Activities', exact: true }).click();
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
        'No horizontal page overflow',
      );
      const violation = (
        await new AxeBuilder({ page })
          .include('.companion-card')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations;
      assert.deepEqual(
        violation.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
        [],
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: '/tmp/reminduh-refinement/' + name + '-home.png',
      fullPage: true,
    });
    await page.goto(base + '/profile');
    await expect(page.locator('.settings-link')).toBeVisible();
    await expect(page.locator('.settings-section[open]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Routines', exact: true })).toBeVisible();
    await page.screenshot({
      path: '/tmp/reminduh-refinement/' + name + '-profile.png',
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      name +
        ': compact controls, disclosure keyboard/focus, lamp, activity, medication isolation, 320–768px and axe passed',
    );
  } finally {
    await browser.close();
  }
}
