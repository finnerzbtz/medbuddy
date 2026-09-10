import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.MVP_TEST_URL ?? 'http://127.0.0.1:5177';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
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
  localStorage.setItem('reminduh-sound-v1', JSON.stringify({ effects: false, music: false }));
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
      updatedAt: new Date().toISOString(),
    }),
  );
});
const page = await context.newPage();
await page.clock.install();
const checks = [],
  errors = [],
  external = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('request', (r) => {
  if (r.url().startsWith('http') && !r.url().startsWith(origin)) external.push(r.url());
});
const check = (name) => {
  checks.push(name);
  console.log('PASS', name);
};
const level = (ms = 500) =>
  page.evaluate(async (ms) => {
    let peak = 0;
    const timer = setInterval(() => {
      for (const { ctx, analyser } of window.__voiceAudio) {
        if (ctx.state !== 'running') continue;
        const x = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(x);
        peak = Math.max(peak, Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length));
      }
    }, 10);
    await new Promise((r) => setTimeout(r, ms));
    clearInterval(timer);
    return peak;
  }, ms);
const silence = async () => {
  await page.waitForTimeout(350);
  assert.ok((await level(200)) < 0.0001);
};
const installMonitor = async () => {
  await page.waitForFunction(() => window.__appAudio);
  await page.evaluate(() => {
    const mixer = window.__appAudio;
    const play = mixer.playSpeech.bind(mixer);
    let current = { clip: null, automatic: false };
    window.__readStarts = [];
    window.__speech = {
      getState: () => ({
        ...current,
        status: mixer.speech?.source ? 'playing' : mixer.speech ? 'loading' : 'idle',
      }),
    };
    mixer.playSpeech = async (url, onEnd, automatic = false) => {
      current = {
        clip: new URL(url, location.href).pathname
          .split('/')
          .slice(-2)
          .join('/')
          .replace(/\.mp3$/, ''),
        automatic,
      };
      const entry = { ...current };
      const started = await play(url, onEnd, automatic);
      if (started) window.__readStarts.push(entry);
      return started;
    };
  });
};
try {
  await page.goto(origin);
  await page.waitForFunction(() => window.__appStore && window.__appAudio);
  await installMonitor();
  const initial = await page.evaluate(() => window.__appStore.getState().data);
  const card = page.getByRole('region', { name: 'Little thoughts', exact: true });
  const message = card.locator('.wisdom-message');
  const unmute = card.getByRole('button', { name: 'Unmute Blobby', exact: true });
  const mute = card.getByRole('button', { name: 'Mute Blobby', exact: true });
  const current = () => message.getAttribute('data-thought-id');
  const reading = async (voice = 'cloud') => {
    const key = voice + '/' + (await current());
    await page.waitForFunction(
      (key) =>
        window.__speech.getState().clip === key && window.__speech.getState().status === 'playing',
      key,
    );
    assert.ok((await level()) > 0.001);
    return key;
  };
  const rotate = async () => {
    await message.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    const previous = await current();
    await page.clock.fastForward(60_000);
    await expect(message).not.toHaveAttribute('data-thought-id', previous);
  };
  const openVoices = async (voice = 'Cloud') => {
    await card.getByRole('button', { name: 'Choose voice: ' + voice, exact: true }).click();
  };
  const dialog = page.getByRole('dialog', { name: 'Choose a voice', exact: true });
  await message.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__voiceAudio.length), 0);
  await rotate();
  assert.equal(await page.evaluate(() => window.__voiceAudio.length), 0);
  check('Cold start and automatic rotation while muted never create or unmute audio');

  await unmute.click();
  await reading();
  const speakingId = await current();
  await page.clock.fastForward(120_000);
  await expect(message).toHaveAttribute('data-thought-id', speakingId);
  await page.waitForFunction(() => !window.__appAudio.speech, null, { timeout: 25_000 });
  await rotate();
  await reading();
  assert.equal(await page.evaluate(() => window.__speech.getState().automatic), true);
  await expect(message).toHaveAttribute('aria-live', 'off');
  await mute.click();
  await silence();
  const stoppedCount = await page.evaluate(() => window.__readStarts.length);
  await rotate();
  await silence();
  assert.equal(await page.evaluate(() => window.__readStarts.length), stoppedCount);
  await expect(message).toHaveAttribute('aria-live', 'polite');
  check(
    'Unmute reads the current thought; the timer waits for narration, then reads the next bubble automatically; Mute keeps future bubbles silent',
  );

  await page.route('**/audio/voices/**', async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.continue().catch(() => {});
  });
  await unmute.click();
  await page.waitForFunction(() => window.__speech.getState().status === 'loading');
  await mute.click();
  await page.waitForTimeout(1100);
  await silence();
  assert.equal(await page.evaluate(() => window.__readStarts.length), stoppedCount);
  await page.unroute('**/audio/voices/**');
  check('Muting during a delayed download prevents late speech');

  await openVoices();
  await dialog.getByRole('radio', { name: /Pip/ }).check();
  await dialog.getByRole('button', { name: 'Preview Moss voice' }).click();
  assert.ok((await level(800)) > 0.001);
  await page.keyboard.press('Escape');
  await silence();
  await unmute.click();
  await reading('pip');
  await mute.click();
  await page.reload();
  await installMonitor();
  await expect(card.getByRole('button', { name: 'Choose voice: Pip' })).toBeVisible();
  await expect(unmute).toBeVisible();
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem('reminduh-sound-v1')).readThoughts),
    false,
  );
  await rotate();
  await silence();
  await unmute.click();
  await reading('pip');
  check(
    'Voice selection and voice mute persist independently; previews remain available, with no speech leaking out of the dialog',
  );

  await openVoices('Pip');
  await silence();
  await dialog.getByRole('radio', { name: /Quiet/ }).check();
  await page.keyboard.press('Escape');
  await rotate();
  await silence();
  await unmute.click();
  await reading();
  await page.getByRole('button', { name: 'Sound settings', exact: true }).click();
  const sounds = page.getByRole('dialog', { name: 'Sound', exact: true });
  await sounds.getByRole('checkbox', { name: 'Enable audio', exact: true }).uncheck();
  await page.keyboard.press('Escape');
  await silence();
  await unmute.click();
  await reading();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await silence();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await silence();
  check(
    'Quiet and master mute stop speech; explicit Unmute works afterwards, while focus return alone never replays a thought',
  );

  await mute.click();
  await unmute.click();
  await reading();
  await card.getByRole('button', { name: 'Hide little thoughts' }).click();
  await silence();
  await card.getByRole('button', { name: 'Show little thoughts' }).click();
  await reading();
  await page.setViewportSize({ width: 390, height: 480 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await silence();
  const hiddenId = await current();
  await page.clock.fastForward(180_000);
  await expect(message).toHaveAttribute('data-thought-id', hiddenId);
  await message.scrollIntoViewIfNeeded();
  await silence();
  await rotate();
  await reading();
  await page.getByRole('link', { name: 'Help', exact: true }).click();
  await silence();
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await message.scrollIntoViewIfNeeded();
  await reading();
  await page.getByRole('button', { name: /^Feed/ }).click();
  await silence();
  await page.getByRole('button', { name: /^Feed/ }).click();
  await silence();
  check(
    'Hiding, scrolling away, navigation and the feeding tray stop narration; the offscreen timer pauses too',
  );

  const after = await page.evaluate(() => window.__appStore.getState().data);
  for (const key of ['medications', 'records', 'care', 'market', 'reminders'])
    assert.deepEqual(after[key], initial[key]);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await mkdir('rebuild/generated/qa-voice', { recursive: true });
  await writeFile(
    'rebuild/generated/qa-voice/automatic-results.json',
    JSON.stringify(
      { status: 'passed', checks, errors, externalRequests: external.length },
      null,
      2,
    ) + '\n',
  );
} catch (error) {
  console.log(
    JSON.stringify(
      await page.evaluate(() => ({
        reads: window.__readStarts,
        speech: window.__speech?.getState(),
        audio: window.__appAudio?.config,
        errors: document.querySelector('.wisdom-voice-status')?.textContent,
        visible: document.querySelector('.wisdom-message')?.getBoundingClientRect().toJSON(),
        focus: document.hasFocus(),
      })),
    ),
  );
  throw error;
} finally {
  await context.close();
  await browser.close();
}
