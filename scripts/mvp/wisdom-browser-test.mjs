import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import {
  runSuite,
  saved,
  unchangedHealth,
  openSound,
  closeSound,
  rotate,
  setHidden,
} from './wisdom-test-helpers.mjs';

await runSuite('wisdom', async ({ page, base, out, check }) => {
  const bubble = page.locator('.blobby-speech');
  const message = bubble.locator('.wisdom-message');
  await expect(bubble).toHaveCount(1);
  await message.scrollIntoViewIfNeeded();
  await expect(message).toContainText('Mochi says:');
  await expect(bubble.getByRole('button')).toHaveCount(0);
  await expect(bubble.getByRole('link')).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: /Another|Listen|Thought options|Show little thoughts|Hide little thoughts|Choose voice:/,
    }),
  ).toHaveCount(0);
  await expect(page.locator('.companion-checkin-button')).toContainText('Review dose');
  const geometry = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
    return {
      review: rect('.companion-checkin').bottom,
      roomTop: rect('.home-scene').top,
      roomBottom: rect('.home-scene').bottom,
      speechTop: rect('.blobby-speech').top,
      speechBottom: rect('.blobby-speech').bottom,
      actions: rect('.companion-actions').top,
    };
  });
  assert.ok(
    geometry.review <= geometry.roomTop &&
      geometry.roomBottom <= geometry.speechTop &&
      geometry.speechBottom <= geometry.actions,
  );
  const before = await saved(page);
  const initialId = await message.getAttribute('data-thought-id');
  await page.waitForTimeout(1000);
  await expect(message).toHaveAttribute('data-thought-id', initialId);
  check(
    'One compact bubble, no source/paging/settings controls, and medication review remains before the room',
  );
  const seen = new Set(),
    authors = new Set();
  for (let i = 0; i < 35; i++) {
    const id = await message.getAttribute('data-thought-id');
    assert.ok(!seen.has(id), 'No repeat before the full deck');
    seen.add(id);
    if (await message.locator('blockquote').count()) {
      authors.add(await message.locator('figcaption').innerText());
      assert.ok(await message.locator('cite').textContent());
      await expect(message.getByRole('link')).toHaveCount(0);
    }
    await rotate(page);
  }
  await expect(message).toHaveAttribute('data-thought-id', initialId);
  assert.equal(authors.size, 5);
  assert.deepEqual(await saved(page), before);
  check(
    'All 35 thoughts rotate automatically; five quotes retain attribution without source buttons or saved-data changes',
  );

  await page.clock.fastForward(20_000);
  await setHidden(page, true);
  await page.clock.fastForward(300_000);
  await expect(message).toHaveAttribute('data-thought-id', initialId);
  await setHidden(page, false);
  await page.clock.fastForward(25_000);
  await expect(message).toHaveAttribute('data-thought-id', initialId);
  await page.clock.fastForward(15_000);
  await expect(message).not.toHaveAttribute('data-thought-id', initialId);
  const pausedId = await message.getAttribute('data-thought-id');
  await openSound(page);
  await page.clock.fastForward(120_000);
  await expect(message).toHaveAttribute('data-thought-id', pausedId);
  await closeSound(page);
  await page.clock.fastForward(5_000);
  await expect(message).toHaveAttribute('data-thought-id', pausedId);
  check('Background and Sound dialog pause the reading minute without a catch-up burst');

  await page.goto(base + '/profile#accessibility');
  await expect(page.locator('#accessibility')).toBeFocused();
  const setting = page.getByRole('checkbox', { name: 'Little thoughts from Blobby', exact: true });
  await setting.focus();
  await page.keyboard.press('Space');
  await expect(setting).toBeFocused();
  await expect(setting).not.toBeChecked();
  await page.reload();
  await expect(setting).not.toBeChecked();
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(message).not.toHaveAttribute('data-thought-id');
  await expect(bubble).toBeVisible();
  await expect(page.locator('.companion-checkin-button')).toBeVisible();
  await page.goto(base + '/profile#accessibility');
  await expect(page.locator('#accessibility')).toBeFocused();
  await setting.check();
  await page.getByRole('button', { name: 'Use calm settings', exact: true }).click();
  await expect(setting).not.toBeChecked();
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(message).not.toHaveAttribute('data-thought-id');
  await expect(page.locator('.companion-checkin-button')).toBeVisible();
  check(
    'Comfort settings persist the choice; calm mode retains Blobby’s fallback bubble and medication review',
  );

  await page.goto(base + '/profile#accessibility');
  await expect(page.locator('#accessibility')).toBeFocused();
  await setting.check();
  await page.evaluate(() => {
    window.__setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      throw new DOMException('Full', 'QuotaExceededError');
    };
  });
  try {
    // A rejected save deliberately rolls back the controlled checkbox.
    await setting.click();
    await expect(setting).toBeChecked();
  } finally {
    await page.evaluate(() => {
      Storage.prototype.setItem = window.__setItem;
    });
  }
  await setting.uncheck();
  await expect(setting).not.toBeChecked();
  await setting.check();
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(message).toHaveAttribute('data-thought-id', /.+/);
  check('A failed preference write keeps the existing choice; an explicit retry works');

  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    while (!(await message.locator('blockquote').count())) await rotate(page);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const result = await new AxeBuilder({ page })
      .include('.blobby-wisdom')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    assert.deepEqual(
      result.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
      [],
    );
    await page.screenshot({ path: out + '/quote-' + width + '.png', fullPage: true });
  }
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await expect(message).toBeVisible();
  await rotate(page);
  await unchangedHealth(page, before);
  check(
    'Bubble reflows at 320–768px and passes axe, forced colours and reduced motion without medication/self-care changes',
  );
});
