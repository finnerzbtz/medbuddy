import { chromium, webkit, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const socket = createServer();
await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const base = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  {
    env: { ...process.env, VITE_NEON_AUTH_URL: '', VITE_NEON_DATA_URL: '' },
    stdio: 'ignore',
  },
);
const stopped = once(server, 'exit');
const output = 'rebuild/generated/refinement/sound-dialog';
await mkdir(output, { recursive: true });
const fixture = JSON.parse(await readFile('scripts/release-a/fixtures/v1.json', 'utf8'));
fixture.preferences.staticScene = true;
fixture.voice = 'quiet';
fixture.profile.name = 'Alex';
const results = [];
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      ready = (await fetch(base)).ok;
    } catch {}
    if (ready) break;
    await delay(100);
  }
  if (!ready) throw Error('Isolated sound preview did not start');
  for (const [engine, type] of Object.entries({ chromium, webkit })) {
    const browser = await type.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        reducedMotion: 'reduce',
      });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(base + '/profile');
      await page.waitForFunction(() => window.__appStore);
      await page.evaluate(
        (data) => localStorage.setItem('reminduh-mvp-v1', JSON.stringify(data)),
        fixture,
      );
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        for (const scale of [100, 200]) {
          await page.goto(base + '/profile');
          await page.waitForFunction(() => window.__appStore);
          await page.evaluate(
            (value) =>
              document.documentElement.style.setProperty('font-size', value + '%', 'important'),
            scale,
          );
          const trigger = page.getByRole('button', { name: 'Sound settings', exact: true });
          await trigger.click();
          const dialog = page.getByRole('dialog', { name: 'Sound', exact: true });
          await expect(dialog).toBeVisible();
          // Closing preferences must preserve the user's sound choices.
          const enabled = dialog.getByRole('checkbox', { name: 'Enable audio', exact: true });
          if (!(await enabled.isChecked())) await enabled.check();
          const settings = () =>
            page.evaluate(async () => {
              const { useSoundSettings } = await import('/src/audio/AppAudio.ts');
              return useSoundSettings.getState();
            });
          const before = await settings();
          const scrollBody = dialog.locator('.sound-dialog-body');
          const bounds = await scrollBody.boundingBox();
          await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.7);
          await page.mouse.wheel(0, 4000);
          await expect
            .poll(() => scrollBody.evaluate((e) => e.scrollHeight - e.clientHeight - e.scrollTop))
            .toBeLessThan(3);
          const close = dialog.getByRole('button', { name: 'Close sound settings', exact: true });
          const geometry = await close.evaluate((e) => {
            const box = e.getBoundingClientRect();
            const owner = e.closest('dialog').getBoundingClientRect();
            const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
            return {
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height,
              dialogTop: owner.top,
              dialogBottom: owner.bottom,
              viewportHeight: innerHeight,
              hit: e === hit || e.contains(hit),
            };
          });
          expect(geometry.y).toBeGreaterThanOrEqual(geometry.dialogTop);
          expect(geometry.y + geometry.height).toBeLessThanOrEqual(
            Math.min(geometry.dialogBottom, geometry.viewportHeight),
          );
          expect(geometry.x).toBeGreaterThanOrEqual(0);
          expect(geometry.x + geometry.width).toBeLessThanOrEqual(width);
          expect(geometry.hit).toBe(true);
          await page.screenshot({ path: `${output}/${engine}-${width}-${scale}-bottom.png` });
          // A regular click must succeed at the currently visible control: no force or scrollIntoView.
          await close.click();
          await expect(dialog).toHaveCount(0);
          await expect(trigger).toBeFocused();
          expect(await settings()).toEqual(before);
          await trigger.click();
          await dialog.getByRole('checkbox', { name: 'Enable audio', exact: true }).focus();
          await page.keyboard.press('Escape');
          await expect(dialog).toHaveCount(0);
          await expect(trigger).toBeFocused();
          expect(await settings()).toEqual(before);
          // Leaving through the record player link must preserve page navigation focus.
          await trigger.click();
          await dialog.getByRole('link', { name: 'Open record player', exact: true }).click();
          await expect(page).toHaveURL(base + '/music');
          await expect(dialog).toHaveCount(0);
          await expect(page.getByRole('main')).toBeFocused();
          const sources = page.getByRole('group', { name: 'Music source', exact: true });
          await expect(
            sources.getByRole('button', { name: 'Blobby radio', exact: true }),
          ).toBeVisible();
          await sources.getByRole('button', { name: 'Your music', exact: true }).click();
          await expect(
            page.getByRole('heading', { name: 'From your device', exact: true }),
          ).toBeVisible();
          await expect(page.getByRole('heading', { name: 'Apple Music', exact: true })).toHaveCount(
            0,
          );
          await expect(page.getByRole('button', { name: 'Connect', exact: true })).toHaveCount(0);
          await expect(page.getByLabel('Choose music files', { exact: true })).toBeEnabled();
          const chooser = page.waitForEvent('filechooser');
          await page.getByRole('button', { name: 'Add music', exact: true }).click();
          expect((await chooser).isMultiple()).toBe(true);
          await page.screenshot({
            path: `${output}/${engine}-${width}-${scale}-your-music.png`,
            fullPage: true,
          });
          await sources.getByRole('button', { name: 'Blobby radio', exact: true }).click();
          await expect(
            page.getByRole('button', { name: /^(Play Blobby radio|Pause record|Retry music)$/ }),
          ).toBeEnabled();
          results.push({ engine, width, scale, geometry, localFileChooser: true, passed: true });
        }
      }
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  }
  await writeFile(`${output}/results.json`, JSON.stringify({ passed: true, results }, null, 2));
  console.log(
    `${results.length} sound dialog cases passed: actual scroll, visible hit-tested close, Escape, focus return, sound preferences preserved, navigation focus and usable local-music controls.`,
  );
} finally {
  server.kill('SIGTERM');
  await stopped;
}
