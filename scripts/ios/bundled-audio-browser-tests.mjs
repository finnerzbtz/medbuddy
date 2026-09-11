import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto((process.env.MOBILE_TEST_URL ?? 'http://127.0.0.1:5188') + '/profile');
  const results = await page.evaluate(async () => {
    const { isBundledMediaResponse: accepts, fetchAudioBytes } = await import(
      '/src/audio/bundledAudio.ts'
    );
    const base = 'capacitor://localhost/';
    const cases = [
      accepts('/audio/music.mp3', 0, true, base),
      !accepts('/audio/music.mp3', 404, true, base),
      !accepts('/audio/music.mp3', 0, false, base),
      !accepts('https://external.example/audio/music.mp3', 0, true, base),
      !accepts('/private.mp3', 0, true, base),
      !accepts('/audio/../private.mp3', 0, true, base),
      !accepts('/audio/music.mp3', 0, true, 'https://localhost/'),
    ];
    const original = window.fetch;
    try {
      for (const response of [
        new Response('', { status: 200 }),
        new Response('missing', { status: 404 }),
      ]) {
        window.fetch = async () => response;
        try {
          await fetchAudioBytes('/audio/music.mp3');
          cases.push(false);
        } catch {
          cases.push(true);
        }
      }
    } finally {
      window.fetch = original;
    }
    return cases;
  });
  assert.ok(
    results.every(Boolean),
    'Only trusted native media status-zero responses are accepted; empty and failed responses reject',
  );
  await expect(page.locator('.settings-section[open]')).toHaveCount(0);
  await page.locator('#sound > summary').click();
  await expect(page.getByRole('button', { name: 'Test sound', exact: true })).toBeVisible();
  await page.goto((process.env.MOBILE_TEST_URL ?? 'http://127.0.0.1:5188') + '/profile#reminders');
  await expect(page.locator('#reminders')).toHaveAttribute('open', '');
  assert.equal(await page.locator('#reminders').count(), 1);
  await page.evaluate(() => window.__appStore.getState().completeWelcome('Test', 'Blobby'));
  await page.goto((process.env.MOBILE_TEST_URL ?? 'http://127.0.0.1:5188') + '/');
  await expect(page.locator('.blobby-speech')).toHaveCount(1);
  await expect(page.locator('.blobby-speech')).toBeVisible();
  await expect(page.locator('.blobby-speech').getByRole('button')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/reminduh-simple-home.png', fullPage: true });
  await page.goto((process.env.MOBILE_TEST_URL ?? 'http://127.0.0.1:5188') + '/profile');
  await expect(page.locator('#sound > summary')).toBeVisible();
  await page.screenshot({ path: '/tmp/reminduh-simple-profile.png', fullPage: true });
  console.log('Bundled-media validation, collapsed settings and reminder deep-link checks passed.');
} finally {
  await browser.close();
}
