import { chromium, webkit, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';

// Generated in memory: no personal library, remote media or upload endpoint.
const frames = 44100 * 20;
const wav = Buffer.alloc(44 + frames * 2);
wav.write('RIFF', 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(44100, 24);
wav.writeUInt32LE(88200, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(frames * 2, 40);
for (let i = 0; i < frames; i++)
  wav.writeInt16LE(Math.round(Math.sin((i * 2 * Math.PI * 220) / 44100) * 1200), 44 + i * 2);
const file = (name = 'Generated quiet tone.wav') => ({ name, mimeType: 'audio/wav', buffer: wav });

let server, stopped;
let base = process.env.MOBILE_TEST_URL;
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
    {
      env: { ...process.env, VITE_NEON_AUTH_URL: '', VITE_NEON_DATA_URL: '' },
      stdio: 'ignore',
    },
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
  assert.ok(ready, 'Isolated file-player preview starts');
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    if (process.env.FILE_PLAYER_ENGINE && process.env.FILE_PLAYER_ENGINE !== engineName) continue;
    const browser = await engine.launch();
    try {
      for (const native of [false, true]) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        // Exercise production file/mixer modules with real HTMLAudioElement/Web Audio.
        // Native shape changes only platform identity and the AVAudioSession boundary;
        // actual native audio-session behavior requires separate native verification.
        await context.route('**/src/native/platform.ts', (route) =>
          route.fulfill({
            contentType: 'text/javascript',
            body: `export const isNative = ${native};`,
          }),
        );
        await context.route('**/src/native/audio.ts', (route) =>
          route.fulfill({
            contentType: 'text/javascript',
            body: 'export async function prepareAudioPlayback() { if (window.__failPlayback) throw new Error("Playback session unavailable"); if (window.__holdPlayback) await new Promise(resolve => { window.__releasePlayback = resolve; }); }',
          }),
        );
        await context.route('**/__file-player-test', (route) =>
          route.fulfill({
            contentType: 'text/html',
            body: `
          <!doctype html><html><body>
          <input aria-label="Music files" type="file" multiple>
          <button id="play">Play first</button><button id="resume">Resume</button>
          <button id="pause">Pause</button><button id="mute">Mute</button>
          <button id="clear">Clear queue</button><button id="radio">Play radio</button>
          <p role="alert" id="error"></p>
          <script type="module">
            localStorage.setItem('reminduh-sound-v1', JSON.stringify({ effects: false, readThoughts: false }));
            const OriginalAudio = window.Audio;
            const monitor = new AudioContext();
            const analyser = monitor.createAnalyser(); analyser.connect(monitor.destination);
            window.__analyser = analyser;
            window.Audio = function(...args) {
              const audio = new OriginalAudio(...args);
              monitor.createMediaElementSource(audio).connect(analyser);
              window.__fileAudio = audio;
              return audio;
            };
            const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
            window.__created = []; window.__revoked = [];
            URL.createObjectURL = (...args) => { const url = originalCreate(...args); window.__created.push(url); return url; };
            URL.revokeObjectURL = (url) => { window.__revoked.push(url); originalRevoke(url); };
            window.__files = await import('/src/audio/RecordPlayerAudio.ts');
            window.__sound = await import('/src/audio/AppAudio.ts');
            __sound.appAudio.setEnvironment('room');
            window.__pending = 0;
            const run = (action) => {
              window.__pending++;
              __files.useRecordPlayer.setState({ error: '' });
              void monitor.resume().then(action).catch(__files.reportPlayerError).finally(() => window.__pending--);
            };
            document.querySelector('input').onchange = (event) => {
              try { __files.addMusicFiles(event.target.files); } catch (error) { __files.reportPlayerError(error); }
              event.target.value = '';
            };
            document.querySelector('#play').onclick = () => run(() => __files.playLocal(0));
            document.querySelector('#resume').onclick = () => run(() => __files.controlRecord('play'));
            document.querySelector('#pause').onclick = () => run(() => __files.controlRecord('pause'));
            document.querySelector('#mute').onclick = () => __sound.setSoundSettings({ enabled: false });
            document.querySelector('#clear').onclick = () => run(__files.clearMusicFiles);
            document.querySelector('#radio').onclick = () => run(__files.playRadio);
            __files.useRecordPlayer.subscribe((state) => document.querySelector('#error').textContent = state.error);
          </script></body></html>`,
          }),
        );
        const page = await context.newPage();
        const errors = [],
          uploads = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('request', (request) => {
          if (!['GET', 'HEAD'].includes(request.method())) uploads.push(request.url());
        });
        try {
          await page.goto(base + '/__file-player-test');
          await page.waitForFunction(() => window.__files && window.__sound);
          const playing = () =>
            page.evaluate(() => window.__files.useRecordPlayer.getState().playing);
          const state = () => page.evaluate(() => window.__files.useRecordPlayer.getState());
          await page
            .getByLabel('Music files')
            .setInputFiles([file(), file('Second generated tone.wav')]);
          if (native) {
            for (const interruptedBy of ['background', 'clear', 'pause']) {
              await page.evaluate(() => {
                window.__holdPlayback = true;
                window.__releasePlayback = null;
              });
              await page.getByRole('button', { name: 'Play first', exact: true }).click();
              await page.waitForFunction(() => typeof window.__releasePlayback === 'function');
              if (interruptedBy === 'background') {
                await page.evaluate(() => {
                  Object.defineProperty(document, 'hidden', {
                    configurable: true,
                    get: () => true,
                  });
                  document.dispatchEvent(new Event('visibilitychange'));
                });
              } else
                await page
                  .getByRole('button', {
                    name: interruptedBy === 'clear' ? 'Clear queue' : 'Pause',
                    exact: true,
                  })
                  .click();
              await page.evaluate(() => {
                window.__holdPlayback = false;
                window.__releasePlayback();
              });
              await page.waitForFunction(() => window.__pending === 0);
              assert.equal(
                await playing(),
                false,
                interruptedBy + ' cancels first file preparation',
              );
              assert.equal(
                (await state()).source,
                'radio',
                'A cancelled initial file start must not replace the chosen source',
              );
              assert.equal((await state()).error, '', 'Cancellation does not report a broken file');
              assert.equal(
                await page.evaluate(() => __sound.useSoundSettings.getState().enabled),
                false,
                'Cancellation cannot opt the user into sound',
              );
              await page.evaluate(() => {
                Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
                document.dispatchEvent(new Event('visibilitychange'));
              });
              if (interruptedBy === 'clear')
                await page
                  .getByLabel('Music files')
                  .setInputFiles([file(), file('Second generated tone.wav')]);
            }
          }
          await page.getByRole('button', { name: 'Play first', exact: true }).click();
          await expect.poll(playing).toBe(true);
          await expect
            .poll(() => page.evaluate(() => window.__fileAudio.currentTime))
            .toBeGreaterThan(0.1);
          await expect
            .poll(() =>
              page.evaluate(() => {
                const samples = new Float32Array(__analyser.fftSize);
                __analyser.getFloatTimeDomainData(samples);
                return Math.sqrt(
                  samples.reduce((total, value) => total + value * value, 0) / samples.length,
                );
              }),
            )
            .toBeGreaterThan(0.00001);
          assert.equal(await page.evaluate(() => document.hidden), false);
          await page.evaluate(() => window.dispatchEvent(new Event('blur')));
          if (native) {
            await delay(150);
            assert.equal(
              await playing(),
              true,
              'Native foreground blur must not stop a playing file',
            );
          } else {
            await expect.poll(playing).toBe(false);
            await page.getByRole('button', { name: 'Resume', exact: true }).click();
          }
          await page.evaluate(() => {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
            document.dispatchEvent(new Event('visibilitychange'));
          });
          await expect.poll(playing).toBe(false);
          await page.evaluate(() => {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
            document.dispatchEvent(new Event('visibilitychange'));
            window.dispatchEvent(new Event('focus'));
          });
          assert.equal(
            await playing(),
            false,
            'Returning foreground must not auto-resume personal music',
          );
          await page.getByRole('button', { name: 'Resume', exact: true }).click();
          await expect.poll(playing).toBe(true);
          await page.getByRole('button', { name: 'Mute', exact: true }).click();
          await expect.poll(playing).toBe(false);
          assert.equal(await page.evaluate(() => window.__fileAudio.paused), true);
          await page.evaluate(() => window.dispatchEvent(new Event('focus')));
          assert.equal(await playing(), false, 'Focus cannot override master mute');
          await page.getByRole('button', { name: 'Resume', exact: true }).click();
          await expect.poll(playing).toBe(true);
          if (native) {
            for (const interruptedBy of ['background', 'pause', 'mute']) {
              await page.getByRole('button', { name: 'Pause', exact: true }).click();
              await expect.poll(playing).toBe(false);
              await page.evaluate(() => {
                window.__holdPlayback = true;
                window.__releasePlayback = null;
              });
              await page.getByRole('button', { name: 'Resume', exact: true }).click();
              await page.waitForFunction(() => typeof window.__releasePlayback === 'function');
              if (interruptedBy === 'background') {
                await page.evaluate(() => {
                  Object.defineProperty(document, 'hidden', {
                    configurable: true,
                    get: () => true,
                  });
                  document.dispatchEvent(new Event('visibilitychange'));
                });
              } else {
                await page
                  .getByRole('button', {
                    name: interruptedBy === 'pause' ? 'Pause' : 'Mute',
                    exact: true,
                  })
                  .click();
              }
              await page.evaluate(() => {
                window.__holdPlayback = false;
                window.__releasePlayback();
              });
              await page.waitForFunction(() => window.__pending === 0);
              assert.equal(
                await playing(),
                false,
                interruptedBy + ' cancels a pending file resume',
              );
              assert.equal(await page.evaluate(() => window.__fileAudio.paused), true);
              if (interruptedBy === 'mute')
                assert.equal(
                  await page.evaluate(() => __sound.useSoundSettings.getState().enabled),
                  false,
                  'Late preparation cannot undo master mute',
                );
              assert.equal(
                (await state()).error,
                '',
                'A deliberately cancelled resume is not a playback error',
              );
              await page.evaluate(() => {
                Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
                document.dispatchEvent(new Event('visibilitychange'));
                window.dispatchEvent(new Event('focus'));
              });
              assert.equal(
                await playing(),
                false,
                'Foreground return cannot restart a cancelled resume',
              );
              await page.getByRole('button', { name: 'Resume', exact: true }).click();
              await expect.poll(playing).toBe(true);
            }
          }
          if (native) {
            await page.getByRole('button', { name: 'Pause', exact: true }).click();
            await page.evaluate(() => {
              window.__failPlayback = true;
            });
            await page.getByRole('button', { name: 'Resume', exact: true }).click();
            await expect(page.getByRole('alert')).toHaveText('Playback session unavailable');
            assert.equal(
              await playing(),
              false,
              'A real preparation failure stays visible and paused',
            );
            await page.evaluate(() => {
              window.__failPlayback = false;
            });
            await page.getByRole('button', { name: 'Resume', exact: true }).click();
            await expect.poll(playing).toBe(true);
            await expect(page.getByRole('alert')).toBeEmpty();
          }
          assert.equal(
            await page.evaluate(() => window.__sound.useSoundSettings.getState().music),
            false,
            'A file disables bundled radio',
          );
          assert.equal(
            await page.evaluate(() => window.__sound.appAudio.externalMusic),
            true,
            'A file excludes room sound',
          );
          await page.getByRole('button', { name: 'Play radio', exact: true }).click();
          await expect
            .poll(() => page.evaluate(() => window.__sound.useRadioPlayback.getState().playing))
            .toBe(true);
          assert.equal(
            await page.evaluate(() => window.__fileAudio.paused),
            true,
            'Radio cannot overlap personal files',
          );
          await page.getByRole('button', { name: 'Play first', exact: true }).click();
          await expect.poll(playing).toBe(true);
          await page.getByRole('button', { name: 'Clear queue', exact: true }).click();
          await expect.poll(playing).toBe(false);
          assert.equal((await state()).tracks.length, 0);
          assert.equal(await page.evaluate(() => window.__fileAudio.getAttribute('src')), null);
          assert.deepEqual(
            await page.evaluate(() => window.__revoked),
            await page.evaluate(() => window.__created),
          );
          await page.getByLabel('Music files').setInputFiles({
            name: 'Invalid.wav',
            mimeType: 'audio/wav',
            buffer: Buffer.from('not a valid audio file'),
          });
          await page.getByRole('button', { name: 'Play first', exact: true }).click();
          await expect(page.getByRole('alert')).not.toBeEmpty();
          assert.equal(await playing(), false);
          assert.equal(await page.evaluate(() => window.__sound.appAudio.externalMusic), false);
          assert.deepEqual(errors, []);
          assert.deepEqual(uploads, [], 'Files never leave the device');
          console.log(
            engineName +
              (native ? ' native-shaped' : ' browser') +
              ': generated audio plays; foreground/background, mute, mixer exclusivity, queue cleanup and errors pass',
          );
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  if (server) {
    server.kill('SIGTERM');
    await stopped;
  }
}
