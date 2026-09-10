import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out = 'rebuild/generated/qa-room-shop';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } }),
    page = await context.newPage();
  await page.goto('http://127.0.0.1:5177');
  await page.waitForFunction(() => window.__appStore);
  await page.evaluate(() => {
    window.__appStore.getState().completeWelcome('Alex', 'Blobby');
    const d = structuredClone(window.__appStore.getState().data);
    d.market.ownedRoomItems.push('sand_garden', 'record_player', 'lava_lamp', 'coast_view');
    d.room = {
      garden: 'sand_garden',
      table: 'record_player',
      lamp: 'lava_lamp',
      view: 'coast_view',
    };
    window.__appStore.getState().restore(d);
  });
  await page.goto('http://127.0.0.1:5177');
  await page.waitForSelector('[data-scene-ready="true"]');
  await page.evaluate(() => window.__appStore.getState().previewState('idle'));
  await page.waitForTimeout(600);
  const tap = async (xyz) => {
    const point = await page.evaluate((xyz) => {
      const { camera } = window.__assetScene;
      const p = camera.position
        .clone()
        .set(...xyz)
        .project(camera);
      const r = document.querySelector('.live-scene canvas').getBoundingClientRect();
      return [r.left + ((p.x + 1) * r.width) / 2, r.top + ((1 - p.y) * r.height) / 2];
    }, xyz);
    await page.mouse.click(...point);
  };
  await tap([2.02, 1.1, -1.52]);
  await expect(page.getByRole('button', { name: 'Turn lamp on', exact: true })).toBeVisible();
  await tap([2.02, 1.1, -1.52]);
  await expect(page.getByRole('button', { name: 'Turn lamp off', exact: true })).toBeVisible();
  await tap([-1.65, 0.78, -1.23]);
  await expect(page.locator('dialog.room-game[data-game="sand"]')).toBeVisible({ timeout: 12000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await tap([-1.23, 0.725, 0.45]);
  await expect(page.locator('dialog.room-game[data-game="melody"]')).toBeVisible({
    timeout: 12000,
  });
  await page.keyboard.press('Escape');
  const checks = [
    'Direct taps on the lava lamp switch its light off and on',
    'Tapping the actual Zen garden opens sand raking after travel',
    'Tapping the actual record player opens the record player after travel',
  ];
  await writeFile(
    out + '/object-results.json',
    JSON.stringify({ status: 'passed', checks }, null, 2),
  );
  console.log('3 direct room-object checks passed.');
} finally {
  await browser.close();
}
