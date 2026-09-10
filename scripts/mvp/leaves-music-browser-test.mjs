import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const out = 'rebuild/generated/qa-leaves-music';
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript(() => {
  window.__media = [];
  const Native = window.Audio;
  window.Audio = class extends Native {
    constructor(...args) {
      super(...args);
      window.__media.push(this);
    }
  };
  if (!localStorage.getItem('reminduh-mvp-v1'))
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
        preferences: {
          staticScene: true,
          reducedMotion: true,
          reminders: false,
          showWisdom: false,
        },
        reminders: {},
        updatedAt: new Date().toISOString(),
      }),
    );
});
const page = await context.newPage();
const errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(String(e)));
const origin = process.env.MVP_TEST_URL ?? 'http://127.0.0.1:5177';
const audit = async (label) => {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await writeFile(`${out}/${label}-axe.json`, JSON.stringify(r.violations, null, 2));
  assert.deepEqual(
    r.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    [],
    label,
  );
};
const wav = Buffer.alloc(44 + 16000 * 12 * 2);
wav.write('RIFF');
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(16000, 24);
wav.writeUInt32LE(32000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(wav.length - 44, 40);
for (let i = 0; i < 16000 * 12; i++)
  wav.writeInt16LE(Math.round(Math.sin((i / 16000) * Math.PI * 2 * 220) * 2200), 44 + i * 2);
try {
  await page.goto(origin + '/');
  await page.getByRole('button', { name: '120 leaves available. Open leaf wallet' }).click();
  const wallet = page.getByRole('dialog', { name: 'Your leaves' });
  await expect(wallet).toBeVisible();
  await expect(wallet.getByText('+10 for each scheduled check-in')).toBeVisible();
  for (const n of [100, 350, 800])
    await expect(
      wallet.getByRole('button', { name: `${n} leaves, not available yet` }),
    ).toBeDisabled();
  await wallet.getByRole('button', { name: 'Collect', exact: true }).click();
  await expect(wallet.getByText('145', { exact: true })).toBeVisible();
  await expect(wallet.getByRole('button', { name: 'Collected', exact: true })).toBeDisabled();
  await audit('wallet-mobile');
  await page.screenshot({ path: out + '/wallet-mobile.png' });
  await page.setViewportSize({ width: 320, height: 740 });
  assert.equal(await wallet.evaluate((el) => el.scrollWidth > el.clientWidth), false);
  await audit('wallet-320');
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: '145 leaves available. Open leaf wallet' }),
  ).toBeFocused();
  checks.push(
    'Accessible wallet, daily gift once, honest unavailable real-money packs, mobile reflow and focus restoration',
  );
  await page.goto(origin + '/music');
  await page.getByRole('button', { name: 'Play Blobby radio' }).click();
  await expect(page.getByRole('button', { name: 'Pause record' })).toBeVisible();
  await page.waitForFunction(() => window.__appAudio?.musicSource?.buffer.duration > 80);
  await page.getByRole('button', { name: 'Pause record' }).click();
  await page.waitForFunction(() => !window.__appAudio.musicSource);
  await page.setViewportSize({ width: 390, height: 844 });
  await audit('radio-mobile');
  await page.screenshot({ path: out + '/record-radio-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Your music', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeDisabled();
  await expect(page.getByRole('link', { name: /Open Spotify/ })).toHaveAttribute(
    'href',
    'https://open.spotify.com/',
  );
  await page.getByLabel('Choose music files').setInputFiles([
    { name: 'Quiet morning.wav', mimeType: 'audio/wav', buffer: wav },
    { name: 'Soft rain.wav', mimeType: 'audio/wav', buffer: wav },
  ]);
  await page.getByRole('button', { name: 'Play Quiet morning', exact: true }).click();
  await page.waitForFunction(() =>
    window.__media.some((a) => a.src.startsWith('blob:') && !a.paused && a.currentTime > 0.2),
  );
  assert.equal(await page.evaluate(() => window.__appAudio.externalMusic), true);
  await page.getByRole('slider', { name: 'Record player volume' }).fill('15');
  assert.equal(
    await page.evaluate(() => window.__media.find((a) => a.src.startsWith('blob:')).volume),
    0.15,
  );
  await page.getByRole('slider', { name: 'Track position' }).fill('6');
  await expect
    .poll(() =>
      page.evaluate(() => window.__media.find((a) => a.src.startsWith('blob:')).currentTime),
    )
    .toBeGreaterThanOrEqual(6);
  await page.getByRole('button', { name: 'Pause record', exact: true }).click();
  assert.equal(
    await page.evaluate(() => window.__media.find((a) => a.src.startsWith('blob:')).paused),
    true,
  );
  await page.getByRole('button', { name: 'Next track' }).click();
  await expect(page.getByRole('heading', { name: 'Soft rain', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Previous track' }).click();
  await expect(page.getByRole('heading', { name: 'Quiet morning', exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('button', { name: 'Play record', exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByRole('button', { name: 'Play record', exact: true }).click();
  await page.getByRole('button', { name: 'Sound settings', exact: true }).click();
  const soundDialog = page.getByRole('dialog', { name: 'Sound', exact: true });
  await soundDialog.getByRole('checkbox', { name: 'Enable audio', exact: true }).uncheck();
  await page.waitForFunction(
    () => window.__media.every((a) => a.paused) && !window.__appAudio.externalMusic,
  );
  await soundDialog.getByRole('button', { name: 'Close sound settings' }).click();
  await page.getByRole('button', { name: 'Play record', exact: true }).click();
  await audit('music-queue-mobile');
  await page.screenshot({ path: out + '/record-library-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Clear listening queue' }).click();
  await expect(page.getByRole('button', { name: 'Play record', exact: true })).toBeDisabled();
  assert.equal(await page.evaluate(() => window.__media.every((a) => a.paused)), true);
  assert.equal(await page.evaluate(() => window.__appAudio.externalMusic), false);
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await page.locator('.record-grooves').evaluate((el) => getComputedStyle(el).animationName),
    'none',
  );
  checks.push(
    'Radio uses the recorded soundtrack; local audio decodes and plays with seek, volume, pause, next/previous, blur pause and queue cleanup; no library subscription or purchase required',
  );
  assert.deepEqual(errors, []);
  await writeFile(out + '/results.json', JSON.stringify({ status: 'passed', checks }, null, 2));
  console.log('Leaves and record player checks passed.');
} finally {
  await browser.close();
}
