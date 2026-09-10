import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const origin = process.env.MVP_TEST_URL ?? 'http://127.0.0.1:5177';
const controlsOnly = process.argv.includes('--controls-only');
const out = 'rebuild/generated/qa-voice';
await mkdir(out, { recursive: true });
const manifest = JSON.parse(
  await readFile('rebuild/generated/voice/manifest.json', 'utf8').catch(() => '{}'),
);
if (!controlsOnly)
  assert.equal(
    Object.keys(manifest).length,
    108,
    'Generate the approved voice pack before the recorded-audio test',
  );
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
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
page.on('pageerror', (error) => errors.push(String(error)));
page.on('request', (request) => {
  if (request.url().startsWith('http') && !request.url().startsWith(origin))
    external.push(request.url());
});
const check = (label) => {
  checks.push(label);
  console.log('PASS', label);
};
const level = async (ms = 450) =>
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
const openVoices = async (name) => {
  await page.getByRole('button', { name: 'Choose voice: ' + name, exact: true }).click();
};
try {
  await page.goto(origin);
  await expect(page.locator('#main-content')).toBeFocused();
  const before = await page.evaluate(() => window.__appStore.getState().data);
  assert.equal(await page.evaluate(() => window.__voiceAudio.length), 0);
  await openVoices('Cloud');
  const dialog = page.getByRole('dialog', { name: 'Choose a voice', exact: true });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('checkbox', { name: 'Read thoughts aloud', exact: true }),
  ).toBeChecked();
  await dialog.getByRole('checkbox', { name: 'Read thoughts aloud', exact: true }).uncheck();
  await expect(dialog.getByRole('radio', { name: /Cloud/ })).toBeChecked();
  assert.equal(await dialog.getByRole('radio').count(), 4);
  await dialog.getByRole('radio', { name: /Cloud/ }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(dialog.getByRole('radio', { name: /Moss/ })).toBeChecked();
  await dialog.getByRole('slider', { name: 'Voice volume' }).fill('55');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Choose voice: Moss' })).toBeFocused();
  await page.reload();
  await openVoices('Moss');
  await expect(
    dialog.getByRole('checkbox', { name: 'Read thoughts aloud', exact: true }),
  ).not.toBeChecked();
  await expect(dialog.getByRole('slider', { name: 'Voice volume' })).toHaveValue('55');
  await expect(dialog.getByRole('radio', { name: /Moss/ })).toBeChecked();
  assert.equal(await page.evaluate(() => window.__voiceAudio.length), 0);
  check('Voice and volume persist; choosing a voice never starts audio and keyboard focus returns');

  if (controlsOnly) {
    await dialog.getByRole('button', { name: 'Preview Cloud voice' }).click();
    await expect(dialog.getByRole('status')).toContainText('isn’t available yet');
    assert.equal(await page.evaluate(() => window.__voiceAudio.length), 0);
    check('An unprepared recording gives clear feedback without pretending to play');
  } else {
    for (const name of ['Cloud', 'Moss', 'Pip']) {
      await dialog.getByRole('button', { name: 'Preview ' + name + ' voice' }).click();
      await page.waitForFunction(() => window.__appAudio.speech?.source);
      assert.ok((await level(800)) > 0.001, name + ' has audible recorded speech');
      await expect(dialog.getByRole('radio', { name: /Moss/ })).toBeChecked();
      await dialog.getByRole('button', { name: 'Stop ' + name + ' voice' }).click();
      await page.waitForTimeout(200);
      assert.ok((await level(150)) < 0.0001);
    }
    check(
      'All three distinct recordings produce sound; previewing preserves the chosen voice and Stop silences it',
    );
    await dialog.getByRole('button', { name: 'Preview Cloud voice' }).click();
    await page.waitForFunction(() => window.__appAudio.speech?.source);
    await dialog.getByRole('button', { name: 'Preview Pip voice' }).click();
    await expect(dialog.getByRole('button', { name: 'Preview Cloud voice' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Stop Pip voice' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    assert.ok((await level(150)) < 0.0001);
    check('Changing previews replaces speech; closing the dialog stops playback');
    await openVoices('Moss');
  }
  await dialog.getByText('Preview words', { exact: true }).click();
  await expect(
    dialog.getByText('Hello, I’m Blobby. Let’s take a little moment together. There’s no hurry.'),
  ).toBeVisible();
  const audit = await new AxeBuilder({ page })
    .include('.voice-dialog')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  assert.deepEqual(
    audit.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    [],
  );
  await page.screenshot({ path: out + '/voice-picker-mobile.png' });
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 700 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.ok(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
  }
  await dialog.getByRole('radio', { name: /Quiet/ }).check();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Unmute Blobby' })).toBeVisible();
  await expect(page.locator('.wisdom-message')).toBeVisible();
  check(
    'Quiet retains readable thoughts; labelled samples, native radio keys, mobile reflow and axe pass',
  );
  await openVoices('Quiet');
  await dialog.getByRole('radio', { name: /Cloud/ }).check();
  await page.keyboard.press('Escape');

  if (!controlsOnly) {
    const listen = page.getByRole('button', { name: 'Unmute Blobby', exact: true });
    const stop = page.getByRole('button', { name: 'Mute Blobby', exact: true });
    await listen.click();
    await page.waitForFunction(() => window.__appAudio.speech?.source);
    assert.ok((await level(500)) > 0.001);
    await stop.click();
    await expect(listen).toBeVisible();
    await page.waitForTimeout(200);
    assert.ok((await level(150)) < 0.0001);
    await listen.click();
    await page.waitForFunction(() => window.__appAudio.speech?.source);
    await page.getByRole('button', { name: 'Hide little thoughts' }).click();
    await page.waitForTimeout(200);
    assert.ok((await level(150)) < 0.0001);
    await page.getByRole('button', { name: 'Show little thoughts' }).click();
    await page.waitForFunction(() => window.__appAudio.speech?.source);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(200);
    assert.ok((await level(150)) < 0.0001);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(200);
    assert.ok((await level(150)) < 0.0001);
    check(
      'Unmute reads the selected thought; Mute, Hide and focus loss cancel it without resuming later',
    );

    // A newly selected thought must not start playing after its delayed request was cancelled.
    await stop.click();
    await page.locator('.wisdom-message').scrollIntoViewIfNeeded();
    await page.clock.fastForward(60_000);
    await page.route('**/audio/voices/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.continue().catch(() => {});
    });
    await listen.click();
    await expect(stop).toBeVisible();
    await stop.click();
    await page.waitForTimeout(1100);
    assert.ok((await level(150)) < 0.0001);
    await expect(listen).toBeVisible();
    await page.unroute('**/audio/voices/**');
    check('Stopping a pending recording prevents delayed speech');

    await page.getByRole('button', { name: 'Sound settings', exact: true }).click();
    const sounds = page.getByRole('dialog', { name: 'Sound', exact: true });
    await sounds.getByRole('checkbox', { name: 'Background music', exact: true }).check();
    await sounds.getByRole('checkbox', { name: 'Sound effects', exact: true }).uncheck();
    await sounds.getByRole('button', { name: 'Preview Cloud voice' }).click();
    await page.waitForFunction(() => window.__appAudio.speech?.source);
    assert.equal(await page.evaluate(() => window.__appAudio.config.effects), false);
    assert.ok((await level(500)) > 0.001);
    const ducked = await page.evaluate(() => window.__appAudio.musicBus.gain.value);
    assert.ok(ducked < 0.1);
    await sounds.getByRole('checkbox', { name: 'Enable audio', exact: true }).uncheck();
    await page.waitForTimeout(300);
    assert.ok((await level(200)) < 0.0001);
    await sounds.getByRole('checkbox', { name: 'Background music', exact: true }).uncheck();
    await page.keyboard.press('Escape');
    check(
      'Speech is independent of effects, lowers the music underneath, and respects master mute',
    );
    await listen.click();
    await page.waitForFunction(() => window.__appAudio.speech?.source);
    await page.getByRole('link', { name: 'Help', exact: true }).click();
    await page.waitForTimeout(200);
    assert.ok((await level(150)) < 0.0001);
    check('Navigation cancels speech');
  }
  const after = await page.evaluate(() => window.__appStore.getState().data);
  for (const key of ['medications', 'records', 'care', 'market', 'reminders'])
    assert.deepEqual(after[key], before[key]);
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  await writeFile(
    out + (controlsOnly ? '/controls-results.json' : '/results.json'),
    JSON.stringify(
      { status: 'passed', controlsOnly, checks, errors, externalRequests: external.length },
      null,
      2,
    ),
  );
} finally {
  await context.close();
  await browser.close();
}
