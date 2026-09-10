import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.MVP_TEST_URL ?? 'http://127.0.0.1:5177';
const out = process.env.WISDOM_TEST_OUT ?? 'rebuild/generated/qa-wisdom';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
const context = await browser.newContext({
  viewport: { width: 1280, height: 1100 },
  timezoneId: 'Europe/London',
});
const page = await context.newPage();
const checks = [],
  errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
const check = (name) => {
  checks.push(name);
  console.log('PASS', name);
};
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('reminduh-mvp-v1')));
await page.clock.install({ time: new Date('2026-09-07T12:00:00+01:00') });
await context.addInitScript(() => {
  if (localStorage.getItem('reminduh-mvp-v1')) return;
  localStorage.setItem(
    'reminduh-mvp-v1',
    JSON.stringify({
      schemaVersion: 1,
      onboarded: true,
      profile: { name: 'Alex', petName: 'Mochi' },
      medications: [
        {
          id: 'example-med',
          name: 'Example medicine',
          dosage: '1 tablet · 10 mg per tablet',
          strengthMg: 10,
          tabletsPerDose: 1,
          instructions: '',
          color: '#738962',
          createdAt: '2026-09-07T07:00:00Z',
          archived: false,
          schedules: [
            { from: '2026-09-07', times: ['08:00'], days: [0, 1, 2, 3, 4, 5, 6], active: true },
          ],
          stock: null,
          refillAt: 5,
        },
      ],
      records: {},
      outfit: 'base',
      hiddenGroups: [],
      preferences: { reducedMotion: false, staticScene: false, reminders: false, pauseScene: true },
      reminders: {},
      updatedAt: '2026-09-07T07:00:00Z',
    }),
  );
});
try {
  await page.goto(origin);
  await expect(page.locator('#main-content')).toBeFocused();
  const card = page.getByRole('region', { name: 'Little thoughts', exact: true });
  const message = card.locator('.wisdom-message');
  const rotate = async () => {
    await message.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    const id = await message.getAttribute('data-thought-id');
    await page.clock.fastForward(60_000);
    await expect(message).not.toHaveAttribute('data-thought-id', id);
  };
  await expect(card.getByRole('heading')).toHaveCount(0);
  await expect(message).toContainText('Mochi says:');
  await expect(card.locator('.wisdom-controls button')).toHaveCount(2);
  await expect(card.getByRole('button', { name: 'Choose voice: Cloud' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Unmute Blobby' })).toBeVisible();
  await expect(card.getByRole('button', { name: /Another|Listen|Thought options/ })).toHaveCount(0);
  await expect(card.getByRole('group', { name: 'Thoughts to show' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Check in now', exact: true })).toBeVisible();
  const layout = await page.evaluate(() => ({
    room: document.querySelector('.home-scene').getBoundingClientRect().bottom,
    reminder: document.querySelector('.companion-checkin').getBoundingClientRect().top,
    bubbleTop: document.querySelector('.wisdom-bubble').getBoundingClientRect().top,
    bubbleBottom: document.querySelector('.wisdom-bubble').getBoundingClientRect().bottom,
  }));
  assert.ok(layout.room <= layout.bubbleTop && layout.bubbleBottom < layout.reminder);
  assert.ok(layout.bubbleTop - layout.room < 16, 'Bubble belongs directly beside the room');
  const before = await saved();
  const initialId = await message.getAttribute('data-thought-id');
  await page.waitForTimeout(1500);
  await expect(message).toHaveAttribute('data-thought-id', initialId);
  await page.screenshot({ path: out + '/desktop.png', fullPage: true });
  check(
    'A compact speech bubble sits directly below the room, with no section heading or exposed settings, and leaves the dose CTA clear',
  );

  const seen = new Set();
  const authors = new Set();
  for (let i = 0; i < 35; i++) {
    const id = await message.getAttribute('data-thought-id');
    assert.ok(!seen.has(id), 'Repeated before the deck was exhausted: ' + id);
    seen.add(id);
    if (await message.locator('blockquote').count()) {
      authors.add(await message.locator('figcaption strong').innerText());
      const source = message.getByRole('link', {
        name: 'Source for this quote (opens in a new tab)',
      });
      assert.match(await source.getAttribute('href'), /^https:\/\//);
      await expect(source).toHaveAttribute('target', '_blank');
      await expect(source).toHaveAttribute('rel', 'noopener noreferrer');
      assert.ok(await message.locator('cite').innerText());
    }
    await rotate();
  }
  await expect(message).toHaveAttribute('data-thought-id', initialId);
  assert.equal(authors.size, 5);
  assert.deepEqual(await saved(), before);
  check(
    'All 35 thoughts rotate automatically without repeats or saved-data changes; all five quotes retain attribution and source links',
  );

  // Offscreen time does not consume the minute or build a backlog.
  await page.clock.fastForward(20_000);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.clock.fastForward(300_000);
  await expect(message).toHaveAttribute('data-thought-id', initialId);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.clock.fastForward(30_000);
  await expect(message).toHaveAttribute('data-thought-id', initialId);
  await page.clock.fastForward(10_000);
  await expect(message).not.toHaveAttribute('data-thought-id', initialId);
  const pausedId = await message.getAttribute('data-thought-id');
  await card.getByRole('button', { name: 'Choose voice: Cloud' }).click();
  await page.clock.fastForward(120_000);
  await expect(message).toHaveAttribute('data-thought-id', pausedId);
  await page.keyboard.press('Escape');
  check(
    'Rotation counts a minute of visible time, pauses for lost focus and dialogs, and never catches up in a burst',
  );

  while (!(await message.locator('blockquote').count())) await rotate();
  const quoteId = await message.getAttribute('data-thought-id');
  await message.getByRole('link').focus();
  await page.clock.fastForward(120_000);
  await expect(message).toHaveAttribute('data-thought-id', quoteId);
  await card.getByRole('button', { name: 'Choose voice: Cloud' }).focus();
  await rotate();
  check('A focused quotation source is never replaced under keyboard users');

  const hide = card.getByRole('button', { name: 'Hide little thoughts' });
  await hide.focus();
  await page.keyboard.press('Enter');
  await expect(message).toBeHidden();
  const show = card.getByRole('button', { name: 'Show little thoughts' });
  await expect(show).toBeFocused();
  assert.equal((await saved()).preferences.showWisdom, false);
  await page.reload();
  await expect(show).toBeVisible();
  await expect(message).toBeHidden();
  await page.goto(origin + '/help');
  const setting = page.getByRole('checkbox', { name: 'Little thoughts from Blobby', exact: true });
  await expect(setting).not.toBeChecked();
  await setting.check();
  await page.goto(origin);
  await expect(page.locator('#main-content')).toBeFocused();
  await expect(message).toBeVisible();
  check('Hide preserves keyboard focus, survives reload and can be reversed in comfort settings');

  await page.goto(origin + '/help');
  await page.getByRole('button', { name: 'Use calm settings' }).click();
  await expect(setting).not.toBeChecked();
  await page.goto(origin);
  await expect(page.locator('#main-content')).toBeFocused();
  await expect(message).toBeHidden();
  await expect(page.locator('.companion-checkin-button')).toBeVisible();
  await show.focus();
  await page.keyboard.press('Enter');
  await expect(card.getByRole('button', { name: 'Hide little thoughts' })).toBeFocused();
  await expect(message).toBeVisible();
  check('Calm settings hide thoughts without hiding dose reminders; one button restores them');

  // Do not imply a successful preference change when local storage refuses a write.
  await page.evaluate(() => {
    window.__originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      throw new DOMException('Full', 'QuotaExceededError');
    };
  });
  await hide.click();
  await expect(message).toBeVisible();
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__originalSetItem;
    delete window.__originalSetItem;
  });
  if (await page.getByRole('button', { name: 'Dismiss message' }).count())
    await page.getByRole('button', { name: 'Dismiss message' }).click();
  await hide.click();
  await expect(message).toBeHidden();
  await show.click();
  await expect(message).toBeVisible();
  await expect(page.getByText(/This change could not be saved/)).toHaveCount(0);
  check('A failed save leaves visibility intact and a subsequent successful save clears the error');

  const finalData = await saved();
  for (const key of ['medications', 'records', 'care', 'market', 'reminders']) {
    if (before[key] !== undefined) assert.deepEqual(finalData[key], before[key]);
  }
  const audit = async (name) => {
    const results = await new AxeBuilder({ page })
      .include('.blobby-wisdom')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    assert.deepEqual(
      results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      [],
      name,
    );
  };
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    while (!(await message.locator('blockquote').count())) await rotate();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await audit('quote at ' + width);
    const targets = await card
      .locator('.wisdom-controls button')
      .evaluateAll((buttons) =>
        buttons.map((b) => ({
          w: b.getBoundingClientRect().width,
          h: b.getBoundingClientRect().height,
        })),
      );
    assert.ok(targets.every(({ w, h }) => w >= 44 && h >= 44));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: out + '/mobile-quote.png', fullPage: true });
  while (await message.locator('blockquote').count()) await rotate();
  await audit('tip');
  await page.screenshot({ path: out + '/mobile-tip.png', fullPage: true });
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await expect(message).toBeVisible();
  await card.getByRole('button', { name: 'Choose voice: Cloud' }).focus();
  await rotate();
  await expect(card.getByRole('button', { name: 'Choose voice: Cloud' })).toBeFocused();
  check(
    'The two-control toolbar and bubbles reflow at 320–768px, retain 44px targets and pass axe, reduced-motion and forced-colour checks',
  );
  assert.deepEqual(errors, []);
  await writeFile(
    out + '/results.json',
    JSON.stringify({ status: 'passed', checks, errors }, null, 2),
  );
} finally {
  await context.close();
  await browser.close();
}
