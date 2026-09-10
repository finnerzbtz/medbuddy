import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

const out = 'rebuild/generated/qa-music-update';
await mkdir(out, { recursive: true });
const music = JSON.parse(await readFile('rebuild/generated/audio/manifest.json', 'utf8'))[
  'zen-music'
];
const newURL = music.url;
assert.match(newURL, /soft-afternoon-[a-f0-9]+\.mp3$/);
const oldURL = '/audio/zen-music.mp3';
const oldBytes = await readFile('rebuild/generated/audio/lofi-room-v1/mastered.mp3');
const oldSha = createHash('sha256').update(oldBytes).digest('hex');
const assets = new Map();
async function collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await collect(file);
    else assets.set('/' + path.relative('dist', file), await readFile(file));
  }
}
await collect('dist');
let version = 0;
let workerAvailable = true;
const server = createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const key = path.extname(pathname) ? pathname : '/index.html';
  if (key === '/sw.js' && !workerAvailable) {
    res.writeHead(503);
    res.end();
    return;
  }
  let body = assets.get(key);
  if (key === oldURL) body = oldBytes;
  if (!body) {
    res.writeHead(404);
    res.end();
    return;
  }
  if (key === '/sw.js') {
    body = Buffer.from(
      body
        .toString()
        .replace(
          /const CACHE = '[^']+';/,
          `const CACHE = 'reminduh-app-music-fixture-${version}';`,
        ),
    );
  }
  if (!version && key.endsWith('.js'))
    body = Buffer.from(body.toString().replaceAll(newURL, oldURL));
  const mime =
    {
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.html': 'text/html',
      '.json': 'application/json',
      '.mp3': 'audio/mpeg',
      '.webp': 'image/webp',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
    }[path.extname(key)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
  res.end(body);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript(() => {
  window.__musicBuffers = [];
  const original = AudioContext.prototype.createBufferSource;
  AudioContext.prototype.createBufferSource = function () {
    const source = original.call(this);
    const start = source.start.bind(source);
    source.start = (...args) => {
      if (source.loop)
        window.__musicBuffers.push({
          duration: source.buffer.duration,
          loopStart: source.loopStart,
          loopEnd: source.loopEnd,
        });
      return start(...args);
    };
    return source;
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
      profile: { name: 'QA', petName: 'Blobby' },
      medications: [],
      records: {},
      outfit: 'base',
      hiddenGroups: [],
      preferences: { reducedMotion: true, staticScene: true, reminders: false },
      reminders: {},
      updatedAt: '2026-09-08T12:00:00Z',
    }),
  );
});
const page = await context.newPage();
const errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(String(e)));
const trackHash = async (p, url) =>
  p.evaluate(async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Recording unavailable');
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await response.arrayBuffer()))]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('');
  }, url);
try {
  await page.goto(origin + '/music');
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await page.getByRole('button', { name: 'Play Blobby radio' }).click();
  await page.waitForFunction(() => window.__musicBuffers.length);
  assert.equal(await trackHash(page, oldURL), oldSha);
  assert.ok(
    await page.evaluate(
      (oldURL) => performance.getEntriesByType('resource').some((e) => e.name.endsWith(oldURL)),
      oldURL,
    ),
  );
  const saved = await page.evaluate(() => localStorage.getItem('reminduh-mvp-v1'));
  const form = await context.newPage();
  await form.goto(origin + '/meds/new');
  await form.getByLabel('Medication name', { exact: true }).fill('Unfinished test draft');

  // A normal reload while the server is down leaves a working cached app.
  workerAvailable = false;
  await page.reload();
  await page.getByRole('button', { name: 'Play Blobby radio' }).click();
  await expect(page.getByRole('button', { name: 'Pause record' })).toBeVisible();
  workerAvailable = true;
  version = 1;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  const notice = page.getByRole('region', { name: 'App update' });
  await expect(notice).toBeVisible();
  assert.ok(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)));
  await expect(page.getByRole('button', { name: 'Pause record' })).toBeVisible();
  await notice.getByRole('button', { name: 'Later', exact: true }).click();
  await expect(notice).toHaveCount(0);
  await expect(form.getByLabel('Medication name', { exact: true })).toHaveValue(
    'Unfinished test draft',
  );
  checks.push(
    'An update is discovered on reconnection after an unavailable server, without restarting playback or losing an unfinished medication form; Later dismisses it.',
  );

  await page.reload();
  await expect(notice).toBeVisible();
  assert.equal(
    await trackHash(page, oldURL),
    oldSha,
    'Reproduced an old recording surviving a normal reload',
  );
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  assert.deepEqual(
    axe.violations.map((v) => v.id),
    [],
  );
  await page.screenshot({ path: out + '/update-notice-mobile.png' });
  await page.setViewportSize({ width: 320, height: 740 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await notice.getByRole('button', { name: 'Reload to update' }).click();
  await expect(notice).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play Blobby radio' })).toBeVisible();
  assert.equal(await page.evaluate(() => localStorage.getItem('reminduh-mvp-v1')), saved);
  await expect(form.getByLabel('Medication name', { exact: true })).toHaveValue(
    'Unfinished test draft',
  );
  await expect(form.getByRole('region', { name: 'App update' })).toBeVisible();
  checks.push(
    'Reload to update activates the waiting worker, preserves saved data and leaves other tabs’ unfinished work untouched; mobile accessibility scan passed.',
  );

  await page.getByRole('button', { name: 'Play Blobby radio' }).click();
  await page.waitForFunction(() => window.__musicBuffers.length);
  assert.equal(await trackHash(page, newURL), music.sha256);
  assert.ok(
    await page.evaluate(
      (newURL) => performance.getEntriesByType('resource').some((e) => e.name.endsWith(newURL)),
      newURL,
    ),
  );
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Play Blobby radio' }).click();
  await page.waitForFunction(() => window.__musicBuffers.length);
  assert.equal(await trackHash(page, newURL), music.sha256);
  assert.deepEqual(await page.evaluate(() => window.__musicBuffers[0]), {
    duration: 103.4,
    loopStart: 0.5,
    loopEnd: 102.9,
  });
  const cachesKept = await page.evaluate(() => caches.keys());
  assert.deepEqual(cachesKept.sort(), [
    'reminduh-app-music-fixture-0',
    'reminduh-app-music-fixture-1',
  ]);
  checks.push(
    'The new recording is requested and decoded after update and again offline, with its exact SHA-256 verified; the prior cache remains available to older tabs.',
  );
  assert.deepEqual(errors, []);
  await writeFile(
    out + '/results.json',
    JSON.stringify({ checks, oldSha, currentSha: music.sha256, musicURL: newURL, errors }, null, 2),
  );
  console.log(checks.length + ' production music-update checks passed.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
