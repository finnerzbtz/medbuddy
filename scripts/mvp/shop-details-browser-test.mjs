import { chromium, webkit, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';

// Own this preview and browser state; no user data or cloud endpoints are reused.
const socket = createServer();
await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const base = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  {
    env: { ...process.env, VITE_NEON_AUTH_URL: '', VITE_NEON_DATA_URL: '' },
    stdio: 'ignore',
  },
);
const stopped = once(server, 'exit');
const out = 'rebuild/generated/qa-shop-details';
await mkdir(out, { recursive: true });
const fixture = JSON.parse(await readFile('scripts/release-a/fixtures/v1.json', 'utf8'));
fixture.preferences.staticScene = true;
fixture.preferences.showWisdom = false;
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      ready = (await fetch(base)).ok;
    } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Isolated shop preview started');
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    browser = await engine.launch();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(base + '/profile');
    await page.evaluate(
      (data) => localStorage.setItem('reminduh-mvp-v1', JSON.stringify(data)),
      fixture,
    );
    await page.goto(base + '/shop');
    await expect(page.getByRole('heading', { name: 'Blobby shop', exact: true })).toBeVisible();
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem('reminduh-mvp-v1')).schemaVersion === 2,
    );
    const snapshot = () => page.evaluate(() => JSON.parse(localStorage.getItem('reminduh-mvp-v1')));
    const before = await snapshot();
    await expect(page.getByRole('region', { name: 'Selected item' })).toHaveCount(0);
    const mochi = page.getByRole('button', { name: /^Preview Mochi/ });
    await mochi.click();
    const details = page.getByRole('dialog', { name: 'Mochi', exact: true });
    await expect(details).toBeVisible();
    await expect(details.getByRole('heading', { name: 'Mochi', exact: true })).toBeInViewport();
    const buy = details.getByRole('button', { name: 'Buy for 27 leaves', exact: true });
    await expect(buy).toBeInViewport();
    assert.deepEqual(await snapshot(), before, 'Preview does not purchase or alter data');
    await page.screenshot({ path: `${out}/${name}-mobile.png` });
    assert.deepEqual(
      (await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id),
      [],
    );
    await buy.click();
    const confirmation = page.getByRole('dialog', { name: '3 × Mochi', exact: true });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Cancel purchase' }).click();
    await expect(buy).toBeFocused();
    assert.deepEqual(await snapshot(), before, 'Cancelling purchase changes no data');
    // Rotation switches between inline and modal details. If the original Buy
    // control unmounts while confirmation is open, the product card is still a
    // useful, durable focus destination when cancelling.
    await buy.click();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(confirmation).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(details).toHaveCount(0);
    await confirmation.getByRole('button', { name: 'Cancel purchase' }).click();
    await expect(mochi).toBeFocused();
    await expect(mochi).toBeInViewport();
    assert.deepEqual(await snapshot(), before, 'Rotation and cancellation change no data');
    await mochi.click();
    await page.keyboard.press('Escape');
    await expect(details).toHaveCount(0);
    await expect(mochi).toBeFocused();
    await page.getByRole('button', { name: 'Outfits', exact: true }).click();
    const frog = page.getByRole('button', { name: /^Preview Froggy/ });
    await frog.click();
    const outfit = page.locator('.shop-product-dialog');
    await outfit.getByRole('button', { name: 'Wear this outfit', exact: true }).click();
    await expect(outfit.getByRole('button', { name: 'Wearing now', exact: true })).toBeDisabled();
    await expect(outfit.getByRole('heading', { name: 'Froggy', exact: true })).toBeFocused();
    const after = await snapshot();
    assert.equal(after.outfit, 'frog');
    assert.equal(after.market.coins, before.market.coins, 'Wearing an owned outfit is free');
    for (const key of ['medications', 'records', 'reminders', 'care', 'selfCare'])
      assert.deepEqual(after[key], before[key]);
    await outfit.getByRole('button', { name: 'Close item details' }).click();
    await expect(frog).toBeFocused();
    await page.setViewportSize({ width: 320, height: 640 });
    await frog.click();
    assert.ok(await outfit.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth + 1));
    await outfit.getByRole('button', { name: 'Close item details' }).click();
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByRole('region', { name: 'Selected item' })).toBeVisible();
    const original = page.getByRole('button', { name: /^Preview Original/ });
    await original.click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page
        .getByRole('region', { name: 'Selected item' })
        .getByRole('heading', { name: 'Original' }),
    ).toBeVisible();
    await expect(original).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: `${out}/${name}-desktop.png` });
    console.log(
      `${name}: immediate mobile detail, cancel/focus through rotation, no automatic purchase, owned outfit, 320px and desktop passed`,
    );
    await browser.close();
    browser = undefined;
  }
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
  await stopped;
}
