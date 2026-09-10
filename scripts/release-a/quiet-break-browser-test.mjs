import { chromium, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const base = process.env.RELEASE_A_URL ?? 'http://127.0.0.1:5188';
const fixture = JSON.parse(await readFile('scripts/release-a/fixtures/v1.json', 'utf8'));
fixture.preferences.staticScene = true;
fixture.preferences.showWisdom = false;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
});
const page = await context.newPage();
await page.goto(base);
await page.evaluate((d) => localStorage.setItem('reminduh-mvp-v1', JSON.stringify(d)), fixture);
await page.goto(base + '/routines');
await page.getByRole('button', { name: 'Rest Take a quiet break' }).click();
await page.getByRole('button', { name: 'Add routine', exact: true }).click();
await page.getByRole('link', { name: 'Back to Today', exact: true }).click();
const card = page.getByRole('article', { name: 'Take a quiet break', exact: true });
await expect(card).toBeVisible();
const before = await page.evaluate(() => JSON.parse(localStorage.getItem('reminduh-mvp-v1')));
await card.getByRole('button', { name: 'Take a break with Blobby' }).click();
await page.getByRole('button', { name: 'Finish break', exact: true }).click();
await page.getByRole('button', { name: 'Back to activity', exact: true }).click();
await page.getByRole('button', { name: 'Return without recording', exact: true }).click();
expect(
  (await page.evaluate(() => JSON.parse(localStorage.getItem('reminduh-mvp-v1')))).selfCare.records,
).toEqual({});
await card.getByRole('button', { name: 'Take a break with Blobby' }).click();
await page.getByRole('button', { name: 'Finish break', exact: true }).click();
await page.getByRole('dialog').getByRole('button', { name: 'Not today', exact: true }).click();
await expect(card.getByText('Not today', { exact: true })).toBeVisible();
const after = await page.evaluate(() => JSON.parse(localStorage.getItem('reminduh-mvp-v1')));
expect(after.market.coins).toBe(before.market.coins + 5);
for (const key of ['medications', 'records', 'reminders', 'care'])
  expect(after[key]).toEqual(before[key]);
await page.reload();
await expect(
  page.getByRole('article', { name: 'Take a quiet break' }).getByText('Not today', { exact: true }),
).toBeVisible();
await page.getByRole('button', { name: 'Undo Take a quiet break' }).click();
await card.getByRole('button', { name: 'Done', exact: true }).click();
expect(
  (await page.evaluate(() => JSON.parse(localStorage.getItem('reminduh-mvp-v1')))).market.coins,
).toBe(after.market.coins);
await mkdir('rebuild/generated/release-a', { recursive: true });
await page.screenshot({
  path: 'rebuild/generated/release-a/quiet-break-mobile.png',
  fullPage: true,
});
await writeFile(
  'rebuild/generated/release-a/quiet-break-result.json',
  JSON.stringify(
    {
      passed: true,
      checks: [
        'create recurring quiet break',
        'optional break, replay, abandon no record',
        'explicit Not today +5',
        'medication/supply/reminders unchanged',
        'reload retains',
        'undo/relog no extra reward',
      ],
    },
    null,
    2,
  ),
);
console.log('Quiet-break browser slice passed (6 checks).');
await browser.close();
