import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const out = 'rebuild/generated/qa-audio';
const audioManifest = JSON.parse(
  await readFile('rebuild/generated/audio/manifest.json', 'utf8').catch(() => '{}'),
);
const recordedIds = Object.keys(audioManifest);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const checks = [],
  errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(() => {
  const sound = JSON.parse(localStorage.getItem('reminduh-sound-v1') || '{}');
  localStorage.setItem('reminduh-sound-v1', JSON.stringify({ ...sound, readThoughts: false }));
  window.__audio = [];
  const Native = window.AudioContext;
  window.AudioContext = class extends Native {
    constructor(...args) {
      super(...args);
      const analyser = this.createAnalyser();
      analyser.fftSize = 2048;
      analyser.connect(this.destination);
      Object.defineProperty(this, 'destination', { value: analyser });
      window.__audio.push({ context: this, analyser });
    }
  };
});
const level = () =>
  page.evaluate(() =>
    Math.max(
      0,
      ...window.__audio.map(({ context, analyser }) => {
        if (context.state !== 'running') return 0;
        const samples = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(samples);
        return Math.sqrt(samples.reduce((s, v) => s + v * v, 0) / samples.length);
      }),
    ),
  );
const peaks = async (duration = 600) => {
  const values = [];
  for (let i = 0; i < duration / 40; i++) {
    await page.waitForTimeout(40);
    values.push(await level());
  }
  return Math.max(...values);
};
try {
  await page.goto('http://127.0.0.1:5177');
  await page.waitForFunction(() => window.__appStore);
  await page.evaluate(() => {
    window.__appStore.getState().completeWelcome('Alex', 'Blobby');
    const data = structuredClone(window.__appStore.getState().data);
    data.market.ownedRoomItems.push('sand_garden');
    data.room.garden = 'sand_garden';
    window.__appStore.getState().restore(data);
  });
  await page.goto('http://127.0.0.1:5177');
  await page.waitForSelector('[data-scene-ready="true"]');
  await page.evaluate(() => window.__appStore.setState({ previewPaused: true }));
  const saved = await page.evaluate(() => JSON.stringify(window.__appStore.getState().data));
  assert.equal(await page.evaluate(() => window.__audio.length), 0);
  await page.getByRole('button', { name: 'Sound settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sound', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('checkbox', { name: 'Background music', exact: true }).check();
  assert.equal(await page.evaluate(() => window.__audio.length), 0);
  await dialog.getByRole('checkbox', { name: 'Enable audio', exact: true }).check();
  if (recordedIds.length) {
    await page.waitForFunction(
      (ids) => ids.every((id) => window.__appAudio.buffers.has(id)),
      recordedIds,
    );
    assert.ok(
      await page.evaluate(() => window.__appAudio.musicSource?.buffer.duration > 80),
      'Generated soundtrack is playing, not the fallback',
    );
  }
  await page.waitForTimeout(900);
  assert.ok((await peaks()) > 0.0001, 'Music produces real audio');
  await dialog.getByRole('slider', { name: 'Music volume', exact: true }).fill('0');
  await page.waitForTimeout(800);
  assert.ok((await level()) < 0.00002, 'Music volume zero is silent');
  await dialog.getByRole('slider', { name: 'Music volume', exact: true }).fill('22');
  await expect.poll(level).toBeGreaterThan(0.0001);
  await dialog.getByRole('checkbox', { name: 'Background music', exact: true }).uncheck();
  await page.waitForTimeout(150);
  checks.push(
    'No autoplay; opt-in music produces audio, respects volume and stops independently of sound effects.',
  );
  const soundPeaks = {};
  for (const id of [
    'step',
    'bounce',
    'bite',
    'sip',
    'cup',
    'cuddle',
    'delight',
    'cloth',
    'place',
    'lamp',
    'water',
    'bloom',
    'checkin',
    'purchase',
    'sleep',
    'reminder',
  ]) {
    soundPeaks[id] = await page.evaluate(async (id) => {
      window.__appAudio.stopVoices(false);
      let peak = 0;
      const sample = () => {
        for (const { context, analyser } of window.__audio) {
          if (context.state !== 'running') continue;
          const values = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(values);
          peak = Math.max(
            peak,
            Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length),
          );
        }
      };
      const timer = setInterval(sample, 8);
      window.__appAudio.cue(id);
      await new Promise((resolve) => setTimeout(resolve, id === 'checkin' ? 1100 : 450));
      clearInterval(timer);
      return peak;
    }, id);
    assert.ok(soundPeaks[id] > 0.00002, id + ' audible');
    await page.waitForTimeout(450);
  }
  assert.ok(
    soundPeaks.step < 0.015,
    'Footsteps stay well below the previous foreground impact level',
  );
  const steps = await page.evaluate(() => {
    const mixer = window.__appAudio;
    const variants = ['step', 'step-soft-2', 'step-soft-3'].map((id) => mixer.buffers.get(id));
    return variants.map((buffer) => ({
      duration: buffer.duration,
      peak: Math.max(...buffer.getChannelData(0).map(Math.abs)),
    }));
  });
  assert.equal(steps.length, 3);
  assert.ok(steps.every(({ duration, peak }) => duration > 0.1 && duration <= 0.2 && peak < 0.18));
  const distinct = await page.evaluate(() => {
    const samples = [];
    for (let i = 0; i < 3; i++) {
      window.__appAudio.sample('step', 0);
      samples.push([...window.__appAudio.voices].at(-1).source.buffer);
      window.__appAudio.stopVoices(false);
    }
    return new Set(samples).size;
  });
  assert.equal(distinct, 3, 'Consecutive landings use three different recordings');
  const missing = await page.evaluate(() => {
    const mixer = window.__appAudio;
    const ids = ['step', 'step-soft-2', 'step-soft-3'];
    const cached = ids.map((id) => mixer.buffers.get(id));
    ids.forEach((id) => {
      mixer.buffers.delete(id);
      mixer.loading.add(id);
    });
    mixer.last.delete('step');
    mixer.cue('step');
    const count = mixer.voices.size;
    ids.forEach((id, i) => {
      mixer.buffers.set(id, cached[i]);
      mixer.loading.delete(id);
    });
    return count;
  });
  assert.equal(missing, 0, 'Missing footstep recordings stay silent instead of using a synth thud');
  await dialog.getByRole('checkbox', { name: 'Enable audio', exact: true }).uncheck();
  await page.waitForTimeout(150);
  await page.evaluate(async () => window.__appAudio.cue('checkin'));
  assert.ok((await peaks(300)) < 0.00002, 'Mute blocks subsequent events');
  await dialog.getByRole('checkbox', { name: 'Enable audio', exact: true }).check();
  await page.evaluate(async () => window.__appAudio.setHidden(true));
  assert.equal(await page.evaluate(() => window.__audio[0].context.state), 'suspended');
  await page.evaluate(async () => window.__appAudio.setHidden(false));
  await expect.poll(() => page.evaluate(() => window.__audio[0].context.state)).toBe('running');
  checks.push(
    'All 16 scene/action effects produce audio; master mute blocks cues and hidden tabs suspend the mixer.',
  );
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await writeFile(out + '/settings-axe.json', JSON.stringify(axe.violations, null, 2));
  assert.deepEqual(axe.violations, []);
  await page.screenshot({ path: out + '/sound-settings.png' });
  await page.getByRole('button', { name: 'Close sound settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sound settings', exact: true })).toBeFocused();
  // Event timing: pauses/repeated frames and still-pose jumps must never replay old sounds.
  const cues = await page.evaluate(async () => {
    const { SceneSound } = await import('/src/audio/SceneSound.ts');
    const played = [];
    const scene = new SceneSound((id) => played.push(id));
    for (let i = 0; i <= 80; i++) scene.update('tea', 'act', i / 10, -1, 1);
    for (let i = 0; i < 15; i++) scene.update('tea', 'act', 8, -1, 1);
    scene.update('feeding', 'act', 0, 0, 1);
    scene.update('feeding', 'act', 1.55, 0, 1);
    scene.update('feeding', 'act', 2.8, 0, 1);
    scene.update('tea', 'act', 3.6, -1, 1);
    return played;
  });
  assert.deepEqual(cues, ['cup', 'sip', 'sip', 'cup', 'bite', 'bite']);
  const walking = await page.evaluate(async () => {
    const { SceneSound } = await import('/src/audio/SceneSound.ts');
    const { RoomJourney } = await import('/src/domain/choreography.ts');
    const counts = [];
    for (const speed of [0.8, 3.6]) {
      const played = [];
      const scene = new SceneSound((id) => played.push(id));
      for (let frame = 0; frame <= 600; frame++) {
        const t = frame / 60;
        scene.update('walk_to_cushion', 'travel', t, t * speed, 0, t);
      }
      const walking = played.length;
      for (let frame = 0; frame < 120; frame++)
        scene.update('walk_to_cushion', 'travel', 10, 10 * speed, 0, 10);
      scene.update('walk_to_cushion', 'travel', 18, 18 * speed, 0, 18);
      const afterSkip = played.length;
      scene.update('idle', 'act', 0, 18 * speed, 0, 18);
      counts.push({ walking, afterSkip, stopped: played.length });
    }
    const journey = new RoomJourney();
    journey.setActivity('walk_to_cushion');
    const landed = [];
    const scene = new SceneSound((id) => {
      if (id === 'step')
        landed.push({ elapsed: journey.elapsed, squash: journey.squash, phase: journey.phase });
    });
    for (let frame = 0; frame < 1800; frame++) {
      journey.update(1 / 60);
      scene.update(
        journey.animation,
        journey.phase,
        journey.actionTime,
        journey.position[0],
        journey.position[2],
        journey.elapsed,
      );
    }
    return { counts, landed };
  });
  for (const count of walking.counts) {
    assert.equal(count.walking, 26, 'Travel speed never multiplies footsteps');
    assert.equal(count.afterSkip, 26, 'Pauses and skipped animation never queue more footsteps');
    assert.equal(count.stopped, 26);
  }
  assert.ok(walking.landed.length >= 8);
  assert.ok(
    walking.landed.every(({ squash, phase }) => squash < 0.94 && phase === 'travel'),
    'Actual room footsteps coincide with landing compression',
  );
  checks.push(
    'Three new soft recordings alternate at actual hop landings; no bursts, pause repeats or synthetic fallback; action cues retain their timing.',
  );
  // Observe the real rendered cursor, without importing a second HMR module instance.
  await page.evaluate(() => {
    const rotate = CanvasRenderingContext2D.prototype.rotate;
    window.__rakeFrames = [];
    CanvasRenderingContext2D.prototype.rotate = function (angle) {
      if (this.canvas.classList.contains('sand-cursor')) window.__rakeFrames.push({ angle });
      return rotate.call(this, angle);
    };
  });
  await page.getByRole('button', { name: 'Zen: Rake the Zen garden', exact: true }).click();
  await expect(page.locator('[data-sand-ready="true"]')).toBeVisible({ timeout: 15000 });
  const board = page.locator('.sensory-sand-board'),
    box = await board.boundingBox();
  await page.mouse.move(box.x + 110, box.y + 150);
  await page.mouse.down();
  for (let i = 1; i <= 65; i++)
    await page.mouse.move(box.x + 110 + i * 5, box.y + 150 + Math.sin(i * 0.9) * 0.8);
  for (let i = 1; i <= 65; i++)
    await page.mouse.move(box.x + 435 - i * 5, box.y + 150 + Math.sin(i * 0.9) * 0.8);
  await page.mouse.up();
  const frames = await page.evaluate(() => window.__rakeFrames);
  assert.ok(frames.length > 15);
  const turns = frames
    .slice(1)
    .map((f, i) =>
      Math.abs(
        Math.atan2(Math.sin(f.angle - frames[i].angle), Math.cos(f.angle - frames[i].angle)),
      ),
    );
  assert.ok(
    Math.max(...turns) < 0.45,
    'Tiny pointer jitter and reversals cannot whip the rake around',
  );
  await page.getByRole('button', { name: 'Music off', exact: true }).click();
  await page.waitForTimeout(800);
  assert.ok((await peaks()) > 0.0001);
  await page
    .locator('dialog.room-game')
    .getByRole('button', { name: 'Sound settings', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Sound', exact: true })
    .getByRole('checkbox', { name: 'Enable audio', exact: true })
    .uncheck();
  await page.waitForTimeout(200);
  assert.ok((await level()) < 0.00002);
  await page.getByRole('button', { name: 'Close sound settings', exact: true }).click();
  await page.getByRole('button', { name: 'Back to room', exact: true }).click();
  assert.equal(await page.evaluate(() => JSON.stringify(window.__appStore.getState().data)), saved);
  checks.push(
    'Rake frame headings stay smooth across jitter and reversals; garden music and master mute work without changing app data.',
  );
  await page.reload();
  await page.waitForSelector('[data-scene-ready="true"]');
  assert.equal(await page.evaluate(() => window.__audio.length), 0, 'Reload stays quiet');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Sound settings', exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: out + '/sound-settings-mobile.png' });
  assert.deepEqual(errors, []);
  await writeFile(
    out + '/results.json',
    JSON.stringify(
      {
        checks,
        recordedAssets: recordedIds,
        soundPeaks,
        rakeMaxTurnRadians: Math.max(...turns),
        errors,
      },
      null,
      2,
    ),
  );
  console.log(checks.length + ' app audio checks passed.');
} finally {
  await browser.close();
}
