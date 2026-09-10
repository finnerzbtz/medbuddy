import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const origin = 'http://127.0.0.1:5177';
const out = 'rebuild/generated/qa-music-loop';
const manifest = JSON.parse(await readFile('rebuild/generated/audio/manifest.json', 'utf8'));
const browser = await chromium.launch();
const checks = [],
  errors = [];
await mkdir(out, { recursive: true });
async function harness() {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.route('**/__lofi-test', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Isolated music test</title><button id="play">Play</button><button id="mute">Mute</button>',
    }),
  );
  await page.goto(origin + '/__lofi-test');
  await page.evaluate(async () => {
    window.__oscillators = 0;
    const createOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      window.__oscillators++;
      return createOscillator.call(this);
    };
    const { appAudio, enableSound, setSoundSettings } = await import('/src/audio/AppAudio.ts');
    const { MUSIC_LOOP } = await import('/src/generated/music-loop.ts');
    window.__loop = MUSIC_LOOP;
    appAudio.setEnvironment('room');
    document.querySelector('#play').onclick = () =>
      enableSound({
        music: true,
        effects: false,
        readThoughts: false,
        musicVolume: 0.4,
      });
    document.querySelector('#mute').onclick = () => setSoundSettings({ enabled: false });
    window.__level = () => {
      if (!appAudio.ctx || appAudio.ctx.state !== 'running') return 0;
      if (!window.__analyser) {
        window.__analyser = appAudio.ctx.createAnalyser();
        window.__analyser.fftSize = 4096;
        appAudio.musicBus.connect(window.__analyser);
      }
      const values = new Float32Array(window.__analyser.fftSize);
      window.__analyser.getFloatTimeDomainData(values);
      return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
    };
  });
  return { context, page };
}
try {
  const { page, context } = await harness();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**' + manifest['zen-music'].url, async (route) => {
    await gate;
    await route.continue();
  });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(() => window.__appAudio.loading.has('zen-music'));
  await page.waitForTimeout(600);
  assert.deepEqual(
    await page.evaluate(() => ({
      recording: !!window.__appAudio.musicSource,
      oscillators: window.__oscillators,
      level: window.__level(),
    })),
    { recording: false, oscillators: 0, level: 0 },
  );
  await page.getByRole('button', { name: 'Mute', exact: true }).click();
  release();
  await page.waitForFunction(() => window.__appAudio.buffers.has('zen-music'));
  assert.equal(await page.evaluate(() => !!window.__appAudio.musicSource), false);
  checks.push('Slow loading stays silent, and a late decode cannot override mute.');

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__level())).toBeGreaterThan(0.0001);
  const playback = await page.evaluate(() => {
    const source = window.__appAudio.musicSource;
    return {
      start: source.loopStart,
      end: source.loopEnd,
      duration: source.buffer.duration,
      loop: source.loop,
      channels: source.buffer.numberOfChannels,
    };
  });
  assert.equal(playback.start, manifest['zen-music'].loopStart);
  assert.equal(playback.end, manifest['zen-music'].loopEnd);
  assert.ok(playback.duration > playback.end && playback.channels === 2 && playback.loop);

  // Play the actual encoded loop boundary at normal speed, after the entry fade settles.
  await page.evaluate(() => {
    const mixer = window.__appAudio;
    mixer.stopMusic();
    mixer.musicOffset = window.__loop.loopEnd - window.__loop.loopStart - 1.6;
    mixer.startMusic();
    window.__loopSource = mixer.musicSource;
  });
  await page.waitForTimeout(700);
  const levels = [];
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(100);
    levels.push(await page.evaluate(() => window.__level()));
  }
  assert.ok(Math.min(...levels) > 0.0001, 'No silence while crossing the mastered loop boundary');
  assert.ok(Math.max(...levels) < 0.1, 'Loop stays within the quiet mix');
  assert.equal(
    await page.evaluate(() => window.__loopSource === window.__appAudio.musicSource),
    true,
  );
  assert.equal(await page.evaluate(() => window.__oscillators), 0);
  checks.push(
    'Stereo recording crosses its musical loop boundary without a gap, source restart or oscillator fallback.',
  );

  await page.getByRole('button', { name: 'Mute', exact: true }).click();
  const offset = await page.evaluate(() => window.__appAudio.musicOffset);
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => window.__appAudio.musicOffset), offset);
  assert.ok((await page.evaluate(() => window.__level())) < 0.00002);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__appAudio.musicOffset), offset);
  assert.equal(
    await page.evaluate(() => window.__appAudio.musicSource.buffer === window.__loopSource.buffer),
    true,
  );
  await expect.poll(() => page.evaluate(() => window.__level())).toBeGreaterThan(0.0001);
  checks.push(
    'Pause fades to silence; resume preserves musical position and reuses the decoded recording.',
  );
  await context.close();

  const failed = await harness();
  await failed.page.route('**' + manifest['zen-music'].url, (route) =>
    route.fulfill({ status: 404 }),
  );
  await failed.page.getByRole('button', { name: 'Play', exact: true }).click();
  await failed.page.waitForTimeout(1000);
  assert.deepEqual(
    await failed.page.evaluate(() => ({
      recording: !!window.__appAudio.musicSource,
      oscillators: window.__oscillators,
      voices: window.__appAudio.voices.size,
      level: window.__level(),
    })),
    { recording: false, oscillators: 0, voices: 0, level: 0 },
  );
  checks.push('Unavailable music stays quiet instead of substituting synthetic tones.');
  await failed.context.close();
  assert.deepEqual(errors, []);
  await writeFile(
    out + '/results.json',
    JSON.stringify(
      {
        checks,
        playback,
        seamRms: { min: Math.min(...levels), max: Math.max(...levels) },
        errors,
      },
      null,
      2,
    ),
  );
  console.log(checks.length + ' lo-fi music checks passed.');
} finally {
  await browser.close();
}
