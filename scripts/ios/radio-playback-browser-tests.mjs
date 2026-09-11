import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';

const base = process.env.MOBILE_TEST_URL ?? 'http://127.0.0.1:5188';
for (const [name, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch();
  try {
    for (const stopWith of ['pause', 'mute']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.addInitScript(() => {
        localStorage.setItem(
          'reminduh-sound-v1',
          JSON.stringify({ effects: false, readThoughts: false }),
        );
        const OriginalAudioContext = window.AudioContext;
        window.AudioContext = class extends OriginalAudioContext {
          constructor(...args) {
            super(...args);
            const analyser = this.createAnalyser();
            analyser.fftSize = 2048;
            analyser.connect(this.destination);
            Object.defineProperty(this, 'destination', { value: analyser });
            window.__radioAnalyser = analyser;
          }
        };
      });
      let requests = 0;
      let pending;
      await context.route('**/audio/soft-afternoon-*.mp3', async (route) => {
        requests++;
        if (requests === 1) return route.fulfill({ status: 503, body: 'Unavailable' });
        pending = route;
      });
      const page = await context.newPage();
      await page.goto(base + '/profile');
      await page.waitForFunction(() => window.__appStore);
      await page.evaluate(() => window.__appStore.getState().completeWelcome('Audio QA', 'Blobby'));
      await page.goto(base + '/music');
      await page.getByRole('button', { name: 'Play Blobby radio', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Retry music', exact: true })).toBeVisible();
      await expect(page.locator('.record-playback-status')).toHaveText(
        'Music couldn’t load. Tap Retry to try again.',
      );
      await expect(page.locator('.record-player')).toHaveAttribute('data-playing', 'false');
      assert.equal(requests, 1, 'A failed recording must not cause automatic retry loops');
      await page.getByRole('button', { name: 'Retry music', exact: true }).click();
      await expect(page.locator('.record-playback-status')).toHaveText('Loading music…');
      await expect(page.locator('.record-player')).toHaveAttribute('data-playing', 'false');
      await expect.poll(() => !!pending).toBe(true);
      if (stopWith === 'pause') {
        await page.getByRole('button', { name: 'Pause record', exact: true }).click();
      } else {
        await page.getByRole('button', { name: 'Sound settings', exact: true }).click();
        await page
          .locator('.sound-dialog')
          .getByRole('checkbox', { name: 'Enable audio', exact: true })
          .uncheck();
        await page.getByRole('button', { name: 'Close sound settings', exact: true }).click();
      }
      await expect(page.locator('.record-playback-status')).toHaveText('Paused');
      const response = await pending.fetch();
      await pending.fulfill({ response });
      await page.waitForFunction(() => window.__appAudio.buffers.has('zen-music'));
      await expect(page.locator('.record-playback-status')).toHaveText('Paused');
      await expect(page.locator('.record-player')).toHaveAttribute('data-playing', 'false');
      await page.getByRole('button', { name: 'Play Blobby radio', exact: true }).click();
      await expect(page.locator('.record-playback-status')).toHaveText('Playing');
      await expect(page.locator('.record-player')).toHaveAttribute('data-playing', 'true');
      await expect
        .poll(() =>
          page.evaluate(() => {
            const analyser = window.__radioAnalyser;
            const data = new Float32Array(analyser.fftSize);
            analyser.getFloatTimeDomainData(data);
            return Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
          }),
        )
        .toBeGreaterThan(0.00001);
      assert.equal(requests, 2, 'Retry decodes and caches the actual recording');
      await context.close();
    }
    console.log(
      name + ': music errors, retry, real playback and ' + 'pause/mute during loading passed.',
    );
  } finally {
    await browser.close();
  }
}
