import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const origin = process.env.RELEASE_A_PREVIEW_URL ?? 'http://127.0.0.1:4190';
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
});
const page = await context.newPage();
try {
  const fixture = JSON.parse(await readFile('scripts/release-a/fixtures/v1.json', 'utf8'));
  fixture.preferences.staticScene = true;
  fixture.preferences.showWisdom = false;
  await page.goto(origin);
  await page.evaluate((d) => localStorage.setItem('reminduh-mvp-v1', JSON.stringify(d)), fixture);
  await page.goto(origin + '/routines');
  await page.getByRole('button', { name: 'Rest Take a quiet break' }).click();
  await page.getByRole('button', { name: 'Add routine', exact: true }).click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 30000 });
  await context.setOffline(true);
  await page.goto(origin + '/');
  const card = page.getByRole('article', { name: 'Take a quiet break', exact: true });
  await card.getByRole('button', { name: 'Done', exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole('article', { name: 'Take a quiet break' }).getByText('Done', { exact: true }),
  ).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('reminduh-mvp-v1')));
  expect(saved.schemaVersion).toBe(2);
  expect(saved.market.coins).toBe(fixture.market.coins + 5);
  expect(saved.medications).toEqual(fixture.medications);
  expect(saved.records).toEqual(fixture.records);
  await page.goto(origin + '/profile');
  await page.getByText('Backups & data', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export pre-update backup' })).toBeVisible();
  await writeFile(
    'rebuild/generated/release-a/offline-results.json',
    JSON.stringify(
      {
        passed: true,
        checks: [
          'Packaged routines route loads offline',
          'Offline explicit Done persists across reload',
          'Reward granted exactly once; medication preserved',
          'Pre-upgrade recovery export remains available',
        ],
      },
      null,
      2,
    ),
  );
  console.log('Packaged offline routine flow passed (4 checks).');
} finally {
  await browser.close();
}
