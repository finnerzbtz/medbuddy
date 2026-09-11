import { chromium, webkit, expect } from '@playwright/test';

const base = process.env.MOBILE_TEST_URL ?? 'http://127.0.0.1:5188';
for (const [name, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(() =>
      localStorage.setItem(
        'reminduh-sound-v1',
        JSON.stringify({ effects: false, readThoughts: false }),
      ),
    );
    let requests = 0;
    let pending;
    await context.route('**/audio/voices/cartoon-v2/cloud/familiar.mp3*', (route) => {
      requests++;
      if (requests === 1) return route.fulfill({ status: 503, body: 'Unavailable' });
      pending = route;
    });
    const page = await context.newPage();
    await page.goto(base + '/profile');
    await page.getByRole('button', { name: 'Sound settings', exact: true }).click();
    const dialog = page.locator('.sound-dialog');
    const start = dialog.getByRole('button', { name: 'Test sound', exact: true });
    await start.click();
    await expect(
      dialog.getByText('The voice couldn’t play. Please try again.', { exact: true }),
    ).toBeVisible();
    await start.click();
    await expect(dialog.getByText('Loading sound…', { exact: true })).toBeVisible();
    await expect.poll(() => !!pending).toBe(true);
    const stop = dialog.getByRole('button', { name: 'Stop sound test', exact: true });
    await stop.click();
    await expect(start).toBeVisible();
    await expect(dialog.getByText('Loading sound…', { exact: true })).toHaveCount(0);
    // A cancellation should abort the pending request, never start a delayed clip.
    await pending.abort().catch(() => {});
    await context.unroute('**/audio/voices/cartoon-v2/cloud/familiar.mp3*');
    await start.click();
    await expect(stop).toBeVisible();
    await expect(dialog.getByText('Loading sound…', { exact: true })).toHaveCount(0);
    await expect(
      dialog.getByText('The voice couldn’t play. Please try again.', { exact: true }),
    ).toHaveCount(0);
    await expect(stop).toBeVisible();
    await stop.click();
    await expect(start).toBeVisible();
    console.log(
      name + ': Test sound shows load failure, supports cancellation and retries a real recording.',
    );
  } finally {
    await browser.close();
  }
}
