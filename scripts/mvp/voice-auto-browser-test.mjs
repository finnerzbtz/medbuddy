import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import {
  runSuite,
  saved,
  unchangedHealth,
  openSound,
  closeSound,
  rotate,
  installMonitor,
  reading,
  level,
  silence,
  setHidden,
} from './wisdom-test-helpers.mjs';

await runSuite('voice-auto', async ({ page, base, check }) => {
  await installMonitor(page);
  const before = await saved(page);
  const message = page.locator('.wisdom-message');
  const current = () => message.getAttribute('data-thought-id');
  const dialog = page.getByRole('dialog', { name: 'Sound', exact: true });
  const read = dialog.getByRole('checkbox', { name: 'Read thoughts aloud', exact: true });
  const master = dialog.getByRole('checkbox', { name: 'Enable audio', exact: true });
  const configure = async (changes) => {
    await openSound(page);
    if (changes.voice) await dialog.getByRole('radio', { name: new RegExp(changes.voice) }).check();
    if ('read' in changes) await read.setChecked(changes.read);
    if ('enabled' in changes) await master.setChecked(changes.enabled);
    await closeSound(page);
  };
  const starts = () => page.evaluate(() => window.__readStarts.length);
  await message.scrollIntoViewIfNeeded();
  await rotate(page);
  assert.equal(await page.evaluate(() => window.__voiceAudio.length), 0);
  await expect(page.locator('.blobby-speech').getByRole('button')).toHaveCount(0);
  await expect(page.locator('.blobby-speech').getByRole('link')).toHaveCount(0);
  check(
    'Cold start and automatic rotation stay silent until Sound is enabled; bubble has no manual paging or source control',
  );

  // Start on a real quotation, then prove its automatically changed successor is read.
  while (!(await message.locator('blockquote').count())) await rotate(page);
  await configure({ enabled: true });
  const quotedId = await reading(page);
  await expect(message.locator('blockquote')).toBeVisible();
  await page.clock.fastForward(120_000);
  await expect(message).toHaveAttribute('data-thought-id', quotedId);
  await page.waitForFunction(() => window.__speech.getState().status === 'idle', null, {
    timeout: 25000,
  });
  await rotate(page);
  const nextId = await reading(page);
  assert.notEqual(nextId, quotedId);
  await expect(message).toHaveAttribute('aria-live', 'off');
  check(
    'A visible quote is narrated with its exact recording; rotation waits for it to finish, then automatically reads the next bubble',
  );

  await configure({ read: false });
  await silence(page);
  const mutedStarts = await starts();
  await rotate(page);
  await silence(page);
  assert.equal(await starts(), mutedStarts);
  await expect(message).toHaveAttribute('aria-live', 'polite');
  check('Read thoughts aloud off cancels narration and keeps later bubbles silent');

  // Hold a genuine recording response, cancel through the actual Sound UI, then release it.
  let release,
    intercepted = false;
  const responseGate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/audio/voices/**', async (route) => {
    intercepted = true;
    await responseGate;
    await route.continue().catch(() => {});
  });
  try {
    await configure({ read: true });
    await expect.poll(() => intercepted).toBe(true);
    await page.waitForFunction(() => window.__speech.getState().status === 'loading');
    await configure({ read: false });
    release();
    await page.waitForTimeout(500);
    await silence(page);
    assert.equal(await starts(), mutedStarts);
  } finally {
    release();
    await page.unroute('**/audio/voices/**');
  }
  check(
    'Opening Sound and muting a pending recording prevents speech after its delayed response arrives',
  );

  await openSound(page);
  await dialog.getByRole('radio', { name: /Pip/ }).check();
  await dialog.getByRole('button', { name: 'Preview Moss voice', exact: true }).click();
  await page.waitForFunction(() => window.__appAudio.speech?.source);
  assert.ok((await level(page, 800)) > 0.001);
  await expect(dialog.getByRole('radio', { name: /Pip/ })).toBeChecked();
  await closeSound(page);
  await silence(page);
  await page.reload();
  await installMonitor(page);
  await openSound(page);
  await expect(dialog.getByRole('radio', { name: /Pip/ })).toBeChecked();
  await expect(read).not.toBeChecked();
  await read.check();
  await closeSound(page);
  // A saved opt-in still needs a fresh gesture; opening Sound supplies recovery.
  await configure({ enabled: true });
  await reading(page, 'pip');
  check(
    'Voice and read-aloud preference survive reload; previews do not change the selection, and the selected Pip voice reads the bubble',
  );

  await configure({ voice: 'Quiet' });
  await rotate(page);
  await silence(page);
  await configure({ voice: 'Cloud' });
  await reading(page);
  await configure({ enabled: false });
  await silence(page);
  const masterMutedStarts = await starts();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await rotate(page);
  await silence(page);
  assert.equal(await starts(), masterMutedStarts);
  await configure({ enabled: true });
  await reading(page);
  check(
    'Quiet and master mute remain silent; focus cannot unmute, while an explicit audio gesture can read the new bubble',
  );

  await setHidden(page, true);
  await silence(page);
  const hiddenId = await current(),
    hiddenStarts = await starts();
  await page.clock.fastForward(180_000);
  await expect(message).toHaveAttribute('data-thought-id', hiddenId);
  await setHidden(page, false);
  await silence(page);
  assert.equal(await starts(), hiddenStarts, 'Foreground alone does not replay a handled thought');
  await rotate(page);
  await reading(page);
  check('Backgrounding cancels voice and pauses rotation; returning does not replay or catch up');

  await page.setViewportSize({ width: 390, height: 480 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await silence(page);
  const offscreenId = await current();
  await page.clock.fastForward(180_000);
  await expect(message).toHaveAttribute('data-thought-id', offscreenId);
  await message.scrollIntoViewIfNeeded();
  await silence(page);
  await rotate(page);
  await reading(page);
  await page.locator('.feed-button').click();
  await expect(message).toBeHidden();
  await silence(page);
  const suspendedStarts = await starts();
  await page.clock.fastForward(120_000);
  assert.equal(await starts(), suspendedStarts);
  await page.getByRole('button', { name: 'Close food tray', exact: true }).click();
  await page.clock.fastForward(5000);
  await message.scrollIntoViewIfNeeded();
  await silence(page);
  await rotate(page);
  await reading(page);
  check(
    'Offscreen bubbles and the food tray suspend narration/rotation; closing the tray cannot leak queued speech',
  );

  await page.getByRole('link', { name: 'My Blobby', exact: true }).click();
  await silence(page);
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await message.scrollIntoViewIfNeeded();
  await reading(page);
  await page.goto(base + '/profile#accessibility');
  await page.getByRole('checkbox', { name: 'Little thoughts from Blobby', exact: true }).uncheck();
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await silence(page);
  await expect(message).not.toHaveAttribute('data-thought-id');
  await expect(message).toBeVisible();
  check('Navigation cancels narration, and disabling thoughts retains a silent fallback bubble');
  await unchangedHealth(page, before);
});
