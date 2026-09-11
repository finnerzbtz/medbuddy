import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
const context = await browser.newContext({
  viewport: { width: 1024, height: 900 },
  reducedMotion: 'reduce',
});
const page = await context.newPage();
const base = process.env.RELEASE_A_URL ?? 'http://127.0.0.1:5188';
const results = [];
page.on('pageerror', (e) => console.log('Activity error:', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('Browser error:', m.text().slice(0, 300));
});
const fixture = JSON.parse(await readFile('scripts/release-a/fixtures/v1.json', 'utf8'));
fixture.preferences.staticScene = true;
fixture.preferences.hideRewards = true;
fixture.preferences.showWisdom = false;
const snapshot = () =>
  page.evaluate(() => ({
    records: window.__appStore.getState().data.selfCare.records,
    rewards: window.__appStore.getState().data.selfCare.rewards,
    market: window.__appStore.getState().data.market,
    medications: window.__appStore.getState().data.medications,
    doses: window.__appStore.getState().data.records,
    care: window.__appStore.getState().data.care,
  }));
try {
  await page.goto(base);
  await page.evaluate((d) => localStorage.setItem('reminduh-mvp-v1', JSON.stringify(d)), fixture);
  await page.reload();
  await page.waitForFunction(() => !!window.__appStore);
  for (const kind of ['sand', 'garden', 'music', 'tea', 'bed']) {
    await page.evaluate(async (kind) => {
      const s = window.__appStore.getState();
      const { dateKey } = await import('/src/domain/schedule.ts');
      const d = structuredClone(s.data);
      d.selfCare = {
        routines: [],
        records: {},
        rewards: {},
        overrides: {},
        introductionDismissed: true,
      };
      if (kind === 'sand') d.room.garden = 'sand_garden';
      if (kind === 'garden') d.room.garden = 'bonsai';
      if (kind === 'music') {
        d.room.table = 'record_player';
        if (!d.market.ownedRoomItems.includes('record_player'))
          d.market.ownedRoomItems.push('record_player');
      }
      if (kind === 'tea') d.room.table = 'tea_set';
      d.preferences.staticScene = false;
      s.restore(d);
      s.saveRoutine({
        title: 'Activity test',
        category: 'rest',
        activity: kind,
        days: [0, 1, 2, 3, 4, 5, 6],
        startDate: dateKey(),
      });
    }, kind);
    const before = await snapshot();
    const trigger = page
      .getByRole('article', { name: 'Activity test' })
      .getByRole('button', { name: 'Take a break with Blobby' });
    await trigger.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    if (kind === 'sand') {
      await expect(page.locator('.sensory-sand')).toBeVisible();
      await page.screenshot({ path: 'rebuild/generated/release-a/sand-activity.png' });
    }
    if (kind === 'garden') await expect(page.locator('.bonsai-garden')).toBeVisible();
    if (kind === 'music')
      await expect(page.getByRole('heading', { name: 'Record player', exact: true })).toBeVisible();
    if (kind === 'tea' || kind === 'bed') {
      await page.screenshot({
        path: 'rebuild/generated/release-a/' + kind + '-debug.png',
        fullPage: true,
      });
      await expect(page.locator('.routine-room [role="img"]')).toBeVisible({ timeout: 15000 });
      await page.getByRole('button', { name: 'Finish break', exact: true }).click();
    } else await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'How did your routine go?' })).toBeVisible();
    expect(await snapshot()).toEqual(before);
    await page.getByRole('button', { name: 'Back to activity', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    if (kind === 'tea' || kind === 'bed')
      await page.getByRole('button', { name: 'Finish break', exact: true }).click();
    else await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Return without recording', exact: true }).click();
    expect(await snapshot()).toEqual(before);
    await expect(trigger).toBeFocused();
    results.push(kind + ' entry, replay and cancellation keep records/rewards unchanged');
    console.log('✓ ' + results.at(-1));
  }
  await page.evaluate(() => window.__appStore.getState().setPreference('staticScene', true));
  await page
    .getByRole('article', { name: 'Activity test' })
    .getByRole('button', { name: 'Take a break with Blobby' })
    .click();
  await page.getByRole('button', { name: 'Finish break', exact: true }).click();
  const before = await snapshot();
  await page.evaluate(() => {
    window.__originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      throw Error('Synthetic full storage');
    };
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('could not be saved');
  expect(await snapshot()).toEqual(before);
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__originalSetItem;
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
  expect(Object.keys((await snapshot()).records)).toHaveLength(1);
  expect((await snapshot()).market.coins).toBe(before.market.coins + 5);
  await expect(page.locator('#for-you-title')).toBeFocused();
  results.push('Failed save awards nothing; successful explicit retry saves exactly once');
  await writeFile(
    'rebuild/generated/release-a/activity-results.json',
    JSON.stringify({ passed: results.length, results }, null, 2),
  );
} finally {
  await browser.close();
}
