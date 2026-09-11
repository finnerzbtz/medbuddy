import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import {
  runSuite,
  saved,
  unchangedHealth,
  openSound,
  closeSound,
  level,
  silence,
} from './wisdom-test-helpers.mjs';

const controlsOnly = process.argv.includes('--controls-only');
await runSuite('voice', async ({ page, out, check }) => {
  const before = await saved(page);
  assert.equal(await page.evaluate(() => window.__voiceAudio.length), 0);
  const dialog = await openSound(page);
  const read = dialog.getByRole('checkbox', { name: 'Read thoughts aloud', exact: true });
  await expect(read).toBeChecked();
  await read.uncheck();
  await expect(dialog.getByRole('radio', { name: /Cloud/ })).toBeChecked();
  await expect(dialog.getByRole('radio')).toHaveCount(4);
  await dialog.getByRole('radio', { name: /Cloud/ }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(dialog.getByRole('radio', { name: /Moss/ })).toBeChecked();
  await dialog.getByRole('slider', { name: 'Voice volume' }).fill('55');
  await closeSound(page);
  await page.reload();
  await openSound(page);
  await expect(read).not.toBeChecked();
  await expect(dialog.getByRole('slider', { name: 'Voice volume' })).toHaveValue('55');
  await expect(dialog.getByRole('radio', { name: /Moss/ })).toBeChecked();
  assert.equal(await page.evaluate(() => window.__voiceAudio.length), 0);
  check(
    'Voice, read-aloud mute and volume persist; radio keys work and choosing a voice never enables audio',
  );

  if (!controlsOnly) {
    // A real failed response is tested before this recording enters the decoded cache.
    await page.route('**/audio/voices/**/cloud/preview.mp3*', (route) =>
      route.fulfill({ status: 503, body: 'Synthetic recording unavailable' }),
    );
    await dialog.getByRole('button', { name: 'Preview Cloud voice', exact: true }).click();
    await expect(dialog.locator('.voice-feedback')).toHaveText(
      'The voice couldn’t play. Please try again.',
    );
    await page.unroute('**/audio/voices/**/cloud/preview.mp3*');
    for (const name of ['Cloud', 'Moss', 'Pip']) {
      await dialog.getByRole('button', { name: 'Preview ' + name + ' voice', exact: true }).click();
      await page.waitForFunction(() => window.__appAudio.speech?.source);
      assert.ok((await level(page, 800)) > 0.001, name + ' produces decoded recorded speech');
      await expect(dialog.getByRole('radio', { name: /Moss/ })).toBeChecked();
      await dialog.getByRole('button', { name: 'Stop ' + name + ' voice', exact: true }).click();
      await silence(page);
    }
    check(
      'Failed preview shows an error, retry plays, and all three actual recordings produce sound without changing the chosen voice',
    );
    await dialog.getByRole('button', { name: 'Preview Cloud voice', exact: true }).click();
    await page.waitForFunction(() => window.__appAudio.speech?.source);
    await dialog.getByRole('button', { name: 'Preview Pip voice', exact: true }).click();
    await expect(
      dialog.getByRole('button', { name: 'Preview Cloud voice', exact: true }),
    ).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Stop Pip voice', exact: true })).toBeVisible();
    await closeSound(page);
    await silence(page);
    await openSound(page);
    check('A new preview replaces the previous one and closing Sound stops playback');
  }
  await dialog.getByText('Preview words', { exact: true }).click();
  await expect(
    dialog.getByText('Hello, I’m Blobby. Let’s take a little moment together. There’s no hurry.'),
  ).toBeVisible();
  const result = await new AxeBuilder({ page })
    .include('.sound-dialog')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  assert.deepEqual(
    result.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
    [],
  );
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.ok(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
  }
  await page.screenshot({ path: out + '/sound-voice-controls.png' });
  await dialog.getByRole('radio', { name: /Quiet/ }).check();
  await closeSound(page);
  await expect(page.locator('.wisdom-message')).toBeVisible();
  await expect(page.locator('.blobby-speech').getByRole('button')).toHaveCount(0);
  check(
    'Quiet retains the readable bubble; current Sound controls include transcript, mobile reflow and accessible labels',
  );

  if (!controlsOnly) {
    await openSound(page);
    await dialog.getByRole('radio', { name: /Cloud/ }).check();
    await dialog.getByRole('checkbox', { name: 'Background music', exact: true }).check();
    await dialog.getByRole('checkbox', { name: 'Sound effects', exact: true }).uncheck();
    await dialog.getByRole('button', { name: 'Preview Cloud voice', exact: true }).click();
    await page.waitForFunction(() => window.__appAudio.speech?.source);
    assert.ok((await level(page)) > 0.001);
    assert.equal(await page.evaluate(() => window.__appAudio.config.effects), false);
    assert.ok(await page.evaluate(() => window.__appAudio.musicBus.gain.value < 0.1));
    await dialog.getByRole('checkbox', { name: 'Background music', exact: true }).uncheck();
    await dialog.getByRole('checkbox', { name: 'Enable audio', exact: true }).uncheck();
    await silence(page);
    check('Voice works independently of effects, ducks music and obeys master mute');
    await dialog.getByRole('button', { name: 'Preview Cloud voice', exact: true }).click();
    await page.waitForFunction(() => window.__appAudio.speech?.source);
    await dialog.getByRole('link', { name: 'Open record player', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await silence(page);
    check('Navigating from Sound to the record player cancels voice playback');
  }
  await unchangedHealth(page, before);
});
