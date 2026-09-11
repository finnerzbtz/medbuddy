import { chromium, webkit, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Separate diagnostic: actual natural completion versus the original rapid seek
// reproduction, with and without the analyser that reroutes HTML media output.
const socket = createServer();
await new Promise((r) => socket.listen(0, '127.0.0.1', r));
const port = socket.address().port;
await new Promise((r) => socket.close(r));
const base = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { env: { ...process.env, VITE_NEON_AUTH_URL: '', VITE_NEON_DATA_URL: '' }, stdio: 'ignore' },
);
const stopped = once(server, 'exit');
const results = [];
const instrumented = process.env.FILE_PLAYER_QUEUE_ANALYSER === 'true';
const runtimeLifecycle = process.env.FILE_PLAYER_QUEUE_RUNTIME === 'true';
const out =
  'rebuild/generated/refinement/file-player-queue-' +
  (instrumented ? 'instrumented' : 'direct') +
  (runtimeLifecycle ? '-runtime' : '') +
  '-results.json';
function wav(seconds) {
  const frames = Math.round(44100 * seconds),
    bytes = Buffer.alloc(44 + frames * 2);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(44100, 24);
  bytes.writeUInt32LE(88200, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++)
    bytes.writeInt16LE(Math.round(Math.sin((i * 2 * Math.PI * 220) / 44100) * 1200), 44 + i * 2);
  return bytes;
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    if (process.env.FILE_PLAYER_ENGINE && engineName !== process.env.FILE_PLAYER_ENGINE) continue;
    const browser = await engine.launch();
    try {
      // Direct HTMLAudio output is the app's production path. Opt in to the extra
      // analyser only to investigate the retained intermittent WebKit diagnostic.
      for (const completion of ['natural', 'seek'])
        for (const analyser of [instrumented]) {
          if (
            process.env.FILE_PLAYER_QUEUE_COMPLETION &&
            process.env.FILE_PLAYER_QUEUE_COMPLETION !== completion
          )
            continue;
          if (
            process.env.FILE_PLAYER_QUEUE_ANALYSER &&
            process.env.FILE_PLAYER_QUEUE_ANALYSER !== String(analyser)
          )
            continue;
          const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
          const result = {
            engine: engineName,
            completion,
            analyser,
            runtimeLifecycle,
            passed: false,
            error: '',
            events: [],
          };
          const page = await context.newPage();
          page.setDefaultTimeout(8000);
          await page.exposeFunction('__queueEvent', (event) => result.events.push(event));
          await context.route('**/src/native/platform.ts', (route) =>
            route.fulfill({
              contentType: 'text/javascript',
              body: 'export const isNative = false;',
            }),
          );
          await context.route('**/__queue-test', (route) =>
            route.fulfill({
              contentType: 'text/html',
              body: `<!doctype html><body>
          <input type="file" aria-label="Files" multiple>
          <button id="play">Play first</button><button id="resume">Resume</button><button id="mute">Mute</button>
          <script type="module">
          window.__events = { push: event => void window.__queueEvent(event) };
          const trace = (type, extra = {}) => __events.push({ type, time: performance.now(), hidden: document.hidden, activeGesture: navigator.userActivation?.isActive, ...extra });
          let invocation = 0;
          function tracedPromise(label, owner, args, original, state) {
            const call = ++invocation;
            trace(label + '-start', { call, ...state() });
            let promise;
            try { promise = Reflect.apply(original, owner, args); }
            catch (error) { trace(label + '-throw', { call, error: error.message, ...state() }); throw error; }
            trace(label + '-returned', { call, ...state() });
            return promise.then(value => { trace(label + '-resolved', { call, ...state() }); return value; }, error => { trace(label + '-rejected', { call, error: error.message, ...state() }); throw error; });
          }
          const contextIds = new WeakMap(); let contextCount = 0;
          const NativeContext = window.AudioContext;
          window.AudioContext = new Proxy(NativeContext, { construct(target, args) {
            const context = Reflect.construct(target, args); const id = ++contextCount;
            contextIds.set(context, id);
            trace('context-created', { context: id, state: context.state });
            context.addEventListener('statechange', () => trace('context-state', { context: id, state: context.state }));
            return context;
          }});
          for (const method of ['resume', 'suspend']) {
            const original = NativeContext.prototype[method];
            NativeContext.prototype[method] = function(...args) {
              return tracedPromise('context-' + method, this, args, original, () => ({ context: contextIds.get(this), state: this.state }));
            };
          }
          const originalMediaPlay = HTMLMediaElement.prototype.play;
          HTMLMediaElement.prototype.play = function(...args) {
            return tracedPromise('media-play', this, args, originalMediaPlay, () => ({ paused: this.paused, mediaTime: this.currentTime, ready: this.readyState }));
          };
          localStorage.setItem('reminduh-sound-v1', JSON.stringify({ effects: false, readThoughts: false }));
          const monitor = ${analyser} ? new AudioContext() : null;
          const node = monitor?.createAnalyser(); node?.connect(monitor.destination);
          const NativeAudio = window.Audio;
          window.Audio = function(...args) {
            const audio = new NativeAudio(...args); window.__audio = audio;
            if (monitor) monitor.createMediaElementSource(audio).connect(node);
            for (const type of ['play', 'playing', 'pause', 'ended', 'loadstart', 'loadedmetadata', 'canplay', 'error']) audio.addEventListener(type, () => queueMicrotask(() => __events.push({ type, time: performance.now(), paused: audio.paused, ended: audio.ended, mediaTime: audio.currentTime, ready: audio.readyState, index: window.__files?.useRecordPlayer.getState().index, statePlaying: window.__files?.useRecordPlayer.getState().playing })));
            return audio;
          };
          window.__files = await import('/src/audio/RecordPlayerAudio.ts');
          window.__sound = await import('/src/audio/AppAudio.ts');
          const originalUnlock = __sound.appAudio.unlock;
          __sound.appAudio.unlock = function(...args) {
            return tracedPromise('app-unlock', this, args, originalUnlock, () => ({ enabled: __sound.useSoundSettings.getState().enabled }));
          };
          if (${runtimeLifecycle}) {
            // Match AudioRuntime's lifecycle subscriptions without mounting unrelated UI/store effects.
            __sound.appAudio.setHidden(document.hidden);
            document.addEventListener('visibilitychange', () => { trace('runtime-visibility'); __sound.appAudio.setHidden(document.hidden); });
            window.addEventListener('blur', () => { trace('runtime-blur'); __sound.appAudio.setHidden(true); });
            window.addEventListener('focus', () => { trace('runtime-focus'); __sound.appAudio.setHidden(false); });
            const resume = () => { trace('runtime-gesture'); __sound.appAudio.resumeFromGesture(); };
            window.addEventListener('pointerdown', resume, { capture: true, passive: true });
            window.addEventListener('keydown', resume, true);
          }
          trace('runtime-wiring', { enabled: ${runtimeLifecycle} });
          __sound.appAudio.setEnvironment('room');
          window.__pending = 0;
          const run = action => {
            window.__pending++;
            __events.push({ type: 'run-before-monitor', time: performance.now(), monitor: monitor?.state, hidden: document.hidden });
            void (monitor ? monitor.resume() : Promise.resolve()).then(() => { __events.push({ type: 'run-action', time: performance.now(), monitor: monitor?.state, hidden: document.hidden }); return action(); }).then(() => __events.push({ type: 'run-complete', time: performance.now(), hidden: document.hidden })).catch(error => { __events.push({ type: 'rejection', error: error.message }); __files.reportPlayerError(error); }).finally(() => window.__pending--);
          };
          document.querySelector('input').onchange = event => __files.addMusicFiles(event.target.files);
          document.querySelector('#play').onclick = () => run(() => __files.playLocal(0));
          document.querySelector('#resume').onclick = () => run(() => __files.controlRecord('play'));
          document.querySelector('#mute').onclick = () => __sound.setSoundSettings({ enabled: false });
          </script></body>`,
            }),
          );
          try {
            await page.goto(base + '/__queue-test');
            await page.waitForFunction(() => window.__files);
            await page.getByLabel('Files').setInputFiles(
              ['First', 'Second'].map((name) => ({
                name: `${name}.wav`,
                mimeType: 'audio/wav',
                buffer: wav(completion === 'natural' ? 1.2 : 20),
              })),
            );
            const playing = () => page.evaluate(() => __files.useRecordPlayer.getState().playing);
            await page.getByRole('button', { name: 'Play first', exact: true }).click();
            await expect.poll(playing).toBe(true);
            await expect.poll(() => page.evaluate(() => __audio.currentTime)).toBeGreaterThan(0.1);
            if (completion === 'seek') {
              await page.waitForFunction(
                () =>
                  __audio.readyState >= 2 && Number.isFinite(__audio.duration) && !__audio.seeking,
              );
              await page.evaluate(() => __files.seekRecord(__audio.duration - 0.06));
            }
            await expect
              .poll(() => page.evaluate(() => __files.useRecordPlayer.getState().index))
              .toBe(1);
            await expect.poll(playing).toBe(true);
            if (completion === 'seek') {
              await page.waitForFunction(
                () =>
                  __audio.readyState >= 2 && Number.isFinite(__audio.duration) && !__audio.seeking,
              );
              await page.evaluate(() => __files.seekRecord(__audio.duration - 0.06));
            }
            await expect.poll(playing).toBe(false);
            assert.equal(await page.evaluate(() => __audio.ended), true);
            await page.getByRole('button', { name: 'Play first', exact: true }).click();
            await expect.poll(playing).toBe(true);
            await page.evaluate(() => window.dispatchEvent(new Event('blur')));
            await expect.poll(playing).toBe(false);
            await page.getByRole('button', { name: 'Resume', exact: true }).click();
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
            await page.getByRole('button', { name: 'Resume', exact: true }).click();
            await expect.poll(playing).toBe(true);
            await page.getByRole('button', { name: 'Mute', exact: true }).click();
            await expect.poll(playing).toBe(false);
            result.passed = true;
          } catch (error) {
            result.error = error.stack ?? error.message;
          } finally {
            results.push(result);
            console.log(JSON.stringify({ ...result, events: undefined }));
            await context.close();
          }
        }
    } finally {
      await browser.close();
    }
  }
} finally {
  await mkdir('rebuild/generated/refinement', { recursive: true });
  await writeFile(out, JSON.stringify(results, null, 2));
  server.kill('SIGTERM');
  await stopped;
}
if (results.some((result) => !result.passed)) process.exitCode = 1;
