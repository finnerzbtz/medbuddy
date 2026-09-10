import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin = process.env.MVP_PRODUCTION_URL ?? 'http://127.0.0.1:4177';
const voices = Object.values(
  JSON.parse(await readFile('rebuild/generated/voice/manifest.json', 'utf8')),
).map(({ url, bytes, sha256 }) => ({ url, bytes, sha256 }));
assert.equal(voices.length, 108);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
await page.clock.install();
const errors = [],
  external = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('request', (request) => {
  if (!request.url().startsWith(origin)) external.push(request.url());
});
await context.addInitScript(() => {
  window.__voiceAudio = [];
  const Native = window.AudioContext;
  window.AudioContext = class extends Native {
    constructor(...args) {
      super(...args);
      const analyser = this.createAnalyser();
      analyser.fftSize = 2048;
      analyser.connect(this.destination);
      Object.defineProperty(this, 'destination', { value: analyser });
      window.__voiceAudio.push({ ctx: this, analyser });
    }
  };
  if (localStorage.getItem('reminduh-mvp-v1')) return;
  localStorage.setItem(
    'reminduh-sound-v1',
    JSON.stringify({ readThoughts: false, effects: false }),
  );
  localStorage.setItem(
    'reminduh-mvp-v1',
    JSON.stringify({
      schemaVersion: 1,
      onboarded: true,
      profile: { name: 'Alex', petName: 'Blobby' },
      medications: [],
      records: {},
      outfit: 'base',
      hiddenGroups: [],
      preferences: { reducedMotion: true, staticScene: true, reminders: false },
      reminders: {},
      updatedAt: '2026-09-07T07:00:00Z',
    }),
  );
});
const level = (ms = 800) =>
  page.evaluate(async (ms) => {
    let peak = 0;
    const timer = setInterval(() => {
      for (const { ctx, analyser } of window.__voiceAudio) {
        if (ctx.state !== 'running') continue;
        const values = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(values);
        peak = Math.max(peak, Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length));
      }
    }, 10);
    await new Promise((resolve) => setTimeout(resolve, ms));
    clearInterval(timer);
    return peak;
  }, ms);
try {
  await page.goto(origin);
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  const card = page.getByRole('region', { name: 'Little thoughts', exact: true });
  const message = card.locator('.wisdom-message');
  await expect(message).toBeVisible();
  const rotate = async () => {
    await message.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    const previous = await message.getAttribute('data-thought-id');
    await page.clock.fastForward(60_000);
    await expect(message).not.toHaveAttribute('data-thought-id', previous);
  };
  const ids = new Set();
  for (let i = 0; i < 35; i++) {
    ids.add(await message.getAttribute('data-thought-id'));
    await rotate();
  }
  assert.equal(ids.size, 35);
  while (!(await message.locator('blockquote').count())) await rotate();
  await expect(
    card.getByRole('link', { name: 'Source for this quote (opens in a new tab)' }),
  ).toBeVisible();
  const decoded = await page.evaluate(async (clips) => {
    const audio = new AudioContext();
    let count = 0;
    try {
      for (const clip of clips) {
        const response = await fetch(clip.url);
        if (!response.ok) throw new Error('Offline recording unavailable: ' + clip.url);
        const bytes = await response.arrayBuffer();
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
          .map((v) => v.toString(16).padStart(2, '0'))
          .join('');
        if (bytes.byteLength !== clip.bytes || hash !== clip.sha256)
          throw new Error('Cached recording differs: ' + clip.url);
        const buffer = await audio.decodeAudioData(bytes);
        if (buffer.duration < 1 || !buffer.getChannelData(0).some((v) => Math.abs(v) > 0.001))
          throw new Error('Silent recording: ' + clip.url);
        count++;
      }
    } finally {
      await audio.close();
    }
    return count;
  }, voices);
  assert.equal(decoded, 108);
  await card.getByRole('button', { name: 'Choose voice: Cloud', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose a voice', exact: true });
  for (const name of ['Cloud', 'Moss', 'Pip']) {
    await dialog.getByRole('button', { name: 'Preview ' + name + ' voice' }).click();
    await expect(dialog.getByRole('button', { name: 'Stop ' + name + ' voice' })).toBeVisible();
    assert.ok((await level()) > 0.001, name + ' preview produces sound offline');
    await dialog.getByRole('button', { name: 'Stop ' + name + ' voice' }).click();
    await page.waitForTimeout(200);
    assert.ok((await level(150)) < 0.0001, name + ' stops offline');
  }
  await dialog.getByRole('radio', { name: /Pip/ }).check();
  await page.keyboard.press('Escape');
  await card.getByRole('button', { name: 'Unmute Blobby' }).click();
  assert.ok((await level()) > 0.001, 'The selected voice reads a quote offline');
  await card.getByRole('button', { name: 'Mute Blobby' }).click();
  await page.waitForTimeout(200);
  assert.ok((await level(150)) < 0.0001);
  await card.getByRole('button', { name: 'Unmute Blobby' }).click();
  await page.waitForTimeout(1000);
  await page.waitForTimeout(15_000);
  await rotate();
  await expect(card.getByRole('button', { name: 'Mute Blobby' })).toBeVisible();
  assert.ok((await level()) > 0.001, 'A new bubble reads automatically offline');
  await card.getByRole('button', { name: 'Mute Blobby' }).click();
  await page.waitForTimeout(200);
  assert.ok((await level(150)) < 0.0001);
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  const result = {
    status: 'passed',
    thoughtsAvailableOffline: ids.size,
    recordingsVerifiedAndDecodedOffline: decoded,
    audibleOfflinePreviews: ['Cloud', 'Moss', 'Pip'],
    selectedVoiceReadsQuoteOffline: true,
    muteSilencesOfflinePlayback: true,
    automaticReadingOffline: true,
    externalRequests: 0,
    errors,
  };
  await mkdir('rebuild/generated/qa-wisdom', { recursive: true });
  await writeFile(
    'rebuild/generated/qa-wisdom/offline-results.json',
    JSON.stringify(result, null, 2),
  );
  await mkdir('rebuild/generated/qa-voice', { recursive: true });
  await writeFile(
    'rebuild/generated/qa-voice/offline-results.json',
    JSON.stringify(result, null, 2),
  );
  console.log(
    'PASS Offline production reload: all 35 thoughts, all 108 recordings, three audible previews, automatic rotation, Unmute and Mute; no external requests',
  );
} finally {
  await context.close();
  await browser.close();
}
