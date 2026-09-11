import { chromium, webkit, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

export const fixture = {
  schemaVersion: 1,
  onboarded: true,
  profile: { name: 'Alex', petName: 'Mochi' },
  medications: [
    {
      id: 'example-med',
      name: 'Example medicine',
      dosage: '1 tablet · 10 mg per tablet',
      strengthMg: 10,
      tabletsPerDose: 1,
      instructions: '',
      color: '#738962',
      createdAt: '2026-09-10T07:00:00Z',
      archived: false,
      schedules: [
        { from: '2026-09-10', times: ['08:00'], days: [0, 1, 2, 3, 4, 5, 6], active: true },
      ],
      stock: null,
      refillAt: 5,
    },
  ],
  records: {},
  outfit: 'base',
  hiddenGroups: [],
  preferences: { reducedMotion: true, staticScene: true, pauseScene: true, reminders: false },
  reminders: {},
  updatedAt: '2026-09-10T07:00:00Z',
};
export async function runSuite(name, test) {
  let base = process.env.MVP_TEST_URL ?? process.env.MOBILE_TEST_URL;
  let server, stopped;
  if (!base) {
    const socket = createServer();
    await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
    const port = socket.address().port;
    await new Promise((resolve) => socket.close(resolve));
    base = `http://127.0.0.1:${port}`;
    server = spawn(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--strictPort',
      ],
      { env: { ...process.env, VITE_NEON_AUTH_URL: '', VITE_NEON_DATA_URL: '' }, stdio: 'ignore' },
    );
    stopped = once(server, 'exit');
  }
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        ready = (await fetch(base)).ok;
      } catch {}
      if (ready) break;
      await delay(100);
    }
    assert.ok(ready, 'Isolated wisdom preview starts');
    for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
      if (process.env.WISDOM_TEST_ENGINE && engineName !== process.env.WISDOM_TEST_ENGINE) continue;
      const browser = await engine.launch();
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        timezoneId: 'Europe/London',
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      const errors = [],
        external = [],
        checks = [];
      const out = `rebuild/generated/qa-wisdom-current/${engineName}-${name}`;
      await mkdir(out, { recursive: true });
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        if (
          /^https?:/.test(request.url()) &&
          new URL(request.url()).origin !== new URL(base).origin
        )
          external.push(request.url());
      });
      await page.clock.install({ time: new Date('2026-09-10T12:00:00+01:00') });
      await context.addInitScript(
        ({ fixture }) => {
          if (!localStorage.getItem('reminduh-mvp-v1')) {
            localStorage.setItem('reminduh-mvp-v1', JSON.stringify(fixture));
            localStorage.setItem(
              'reminduh-sound-v1',
              JSON.stringify({ enabled: false, music: false, effects: false, readThoughts: true }),
            );
          }
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
        },
        { fixture },
      );
      const check = (label) => {
        checks.push(label);
        console.log(`PASS ${engineName} ${name}: ${label}`);
      };
      try {
        await page.goto(base + '/');
        await page.waitForFunction(() => window.__appStore && window.__appAudio);
        await test({ page, context, base, out, check });
        assert.deepEqual(errors, []);
        assert.deepEqual(external, []);
        await writeFile(
          out + '/results.json',
          JSON.stringify({ status: 'passed', checks, errors, external }, null, 2),
        );
      } catch (error) {
        await page.screenshot({ path: out + '/failure.png', fullPage: true }).catch(() => {});
        await writeFile(
          out + '/failure.json',
          JSON.stringify(
            {
              error: error.stack,
              checks,
              errors,
              external,
              diagnostic: await page
                .evaluate(() => ({
                  speech: window.__speech?.getState(),
                  reads: window.__readStarts,
                  audio: window.__appAudio?.config,
                  message: document.querySelector('.wisdom-message')?.textContent,
                  focus: document.hasFocus(),
                  hidden: document.hidden,
                  dialogs: document.querySelectorAll('dialog[open]').length,
                }))
                .catch(() => null),
            },
            null,
            2,
          ),
        );
        throw error;
      } finally {
        await context.close();
        await browser.close();
      }
    }
  } finally {
    if (server) {
      server.kill('SIGTERM');
      await stopped;
    }
  }
}
export const saved = (page) => page.evaluate(() => window.__appStore.getState().data);
export async function unchangedHealth(page, before) {
  const after = await saved(page);
  for (const key of ['medications', 'records', 'care', 'market', 'reminders', 'selfCare'])
    assert.deepEqual(after[key], before[key], key + ' remains unchanged');
}
export async function openSound(page) {
  await page.getByRole('button', { name: 'Sound settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sound', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}
export async function closeSound(page) {
  await page
    .getByRole('dialog', { name: 'Sound', exact: true })
    .getByRole('button', { name: 'Close sound settings', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Sound settings', exact: true })).toBeFocused();
  if (await page.locator('.wisdom-message').count())
    await page.locator('.wisdom-message').scrollIntoViewIfNeeded();
}
export async function rotate(page) {
  const message = page.locator('.wisdom-message');
  await message.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  const id = await message.getAttribute('data-thought-id');
  assert.ok(id, 'A thought is visible before rotating');
  await page.clock.fastForward(60_000);
  await expect(message).not.toHaveAttribute('data-thought-id', id);
  assert.ok(await message.getAttribute('data-thought-id'), 'Rotation exposes a new thought');
}
export async function setHidden(page, hidden) {
  await page.evaluate((hidden) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await page.waitForTimeout(100);
}
export async function installMonitor(page) {
  await page.evaluate(async () => {
    window.__speech = (await import('/src/audio/BlobbySpeech.ts')).useBlobbySpeech;
    window.__readStarts = [];
    const mixer = window.__appAudio;
    const play = mixer.playSpeech.bind(mixer);
    mixer.playSpeech = async (url, onEnd, automatic = false) => {
      const started = await play(url, onEnd, automatic);
      if (started)
        window.__readStarts.push({
          clip: new URL(url, location.href).pathname
            .split('/')
            .slice(-2)
            .join('/')
            .replace(/\.mp3$/, ''),
          automatic,
        });
      return started;
    };
  });
}
export const level = (page, ms = 500) =>
  page.evaluate(async (ms) => {
    let peak = 0;
    const timer = setInterval(() => {
      for (const { ctx, analyser } of window.__voiceAudio) {
        if (ctx.state !== 'running') continue;
        const values = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(values);
        peak = Math.max(
          peak,
          Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length),
        );
      }
    }, 10);
    await new Promise((resolve) => setTimeout(resolve, ms));
    clearInterval(timer);
    return peak;
  }, ms);
export async function silence(page) {
  await page.waitForTimeout(250);
  assert.ok((await level(page, 200)) < 0.0001, 'No audible speech or music');
}
export async function reading(page, voice = 'cloud') {
  const id = await page.locator('.wisdom-message').getAttribute('data-thought-id');
  assert.ok(id, 'The narrated thought must be visible');
  await page.waitForFunction(
    (key) =>
      window.__speech.getState().clip === key && window.__speech.getState().status === 'playing',
    voice + '/' + id,
  );
  assert.equal(await page.evaluate(() => __speech.getState().automatic), true);
  assert.ok((await level(page)) > 0.001, 'Visible thought has decoded audible narration');
  return id;
}
