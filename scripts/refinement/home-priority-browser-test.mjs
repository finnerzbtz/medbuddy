import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
const base = process.env.REFINEMENT_URL ?? process.env.MOBILE_TEST_URL ?? 'http://127.0.0.1:5193';
const fixture = JSON.parse(await readFile('scripts/release-a/fixtures/v1.json', 'utf8'));
fixture.profile.name = 'Alex';
fixture.preferences.staticScene = true;
fixture.preferences.reducedMotion = true;
fixture.preferences.showWisdom = true;
fixture.records = {};
fixture.reminders = {};
fixture.medications[0].schedules = [
  { from: '2026-09-07', active: true, days: [4], times: ['09:00'] },
];
await mkdir('/tmp/reminduh-refinement', { recursive: true });
for (const [name, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 320, height: 844 },
      timezoneId: 'Europe/London',
      locale: 'en-GB',
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-09-10T12:00:00+01:00') });
    await page.goto(base + '/profile');
    const seed = async (data) => {
      await page.evaluate(
        (data) => localStorage.setItem('reminduh-mvp-v1', JSON.stringify(data)),
        data,
      );
      await page.goto(base + '/');
      await expect(page.locator('.companion-card')).toBeVisible();
    };
    const health = () =>
      page.evaluate(() => {
        const data = window.__appStore.getState().data;
        return JSON.stringify([data.medications, data.records, data.reminders]);
      });
    await seed(fixture);
    const review = page.locator('.companion-checkin');
    await expect(page.locator('.medication-shortcut')).toHaveCount(0);
    await expect(review.getByRole('button', { name: 'Review dose', exact: true })).toBeInViewport();
    const before = await health();
    await review.getByRole('button', { name: 'Review dose', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Fixture medication');
    await page.keyboard.press('Escape');
    assert.equal(await health(), before, 'Review alone never records a dose');
    let geometry = await page.evaluate(() => ({
      review: document.querySelector('.companion-checkin').getBoundingClientRect().bottom,
      room: document.querySelector('.home-scene').getBoundingClientRect().top,
    }));
    assert.ok(
      geometry.review <= geometry.room,
      'Medication review precedes the room and optional play',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: `/tmp/reminduh-refinement/${name}-due-home.png`,
      fullPage: true,
    });
    const historical = structuredClone(fixture);
    historical.medications[0].schedules[0].days = [1];
    await seed(historical);
    await expect(
      page.getByRole('heading', { name: 'Nothing scheduled today', exact: true }),
    ).toBeVisible();
    await expect(review).toContainText(/7.*Sep/);
    await expect(
      review.getByRole('button', { name: 'Review missed check-in', exact: true }),
    ).toBeInViewport();
    await expect(page.locator('.companion-card')).toHaveAttribute('data-state', 'critical');
    const historicalBefore = await health();
    await review.getByRole('button', { name: 'Review missed check-in', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText(/7.*Sep/);
    await page.keyboard.press('Escape');
    assert.equal(
      await health(),
      historicalBefore,
      'Historical review preserves records, supply and reminders',
    );
    await page.screenshot({
      path: `/tmp/reminduh-refinement/${name}-historical-home.png`,
      fullPage: true,
    });

    const empty = structuredClone(fixture);
    empty.medications = [];
    await seed(empty);
    const message = page.locator('.wisdom-message');
    await expect(message).toBeVisible();
    await expect(page.locator('.wisdom-reserve')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.blobby-wisdom')).toHaveCount(1);
    const saved = await health();
    for (const [width, scale] of [
      [390, 1],
      [320, 1],
      [320, 2],
    ]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(
        (scale) => (document.documentElement.style.fontSize = `${scale * 100}%`),
        scale,
      );
      assert.equal(
        await message.locator('p').evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
        14 * scale,
        'The visible quote itself scales',
      );
      const positions = [];
      const seen = new Set();
      const first = await message.getAttribute('data-thought-id');
      for (let i = 0; i < 35; i++) {
        await message.scrollIntoViewIfNeeded();
        await page.waitForTimeout(30);
        const id = await message.getAttribute('data-thought-id');
        assert.ok(id && !seen.has(id), 'Each thought appears once before repeating');
        seen.add(id);
        positions.push(
          await page
            .locator('.companion-actions')
            .evaluate((el) => el.getBoundingClientRect().top + scrollY),
        );
        const bounds = await page.locator('.blobby-wisdom').evaluate((el) => {
          const slot = el.parentElement.getBoundingClientRect(),
            bubble = el.getBoundingClientRect();
          return {
            fits: bubble.top >= slot.top && bubble.bottom <= slot.bottom,
            width: el.scrollWidth <= el.clientWidth + 1,
          };
        });
        assert.ok(
          bounds.fits && bounds.width,
          'Every complete thought fits without covering controls',
        );
        await page.clock.fastForward(60_050);
        await expect(message).not.toHaveAttribute('data-thought-id', id);
      }
      await expect(message).toHaveAttribute('data-thought-id', first);
      assert.ok(
        Math.max(...positions) - Math.min(...positions) < 1.1,
        `Care buttons must stay still at ${width}px/${scale}x text: ${positions}`,
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
    }
    assert.equal(await health(), saved, 'Automatic thoughts do not change medication state');
    assert.deepEqual(errors, []);
    console.log(
      `${name}: single reachable review, historical date/default sadness, medication isolation, all35 automatic thoughts and stable care buttons at320–390px/1–2x actual text passed`,
    );
  } finally {
    await browser.close();
  }
}
