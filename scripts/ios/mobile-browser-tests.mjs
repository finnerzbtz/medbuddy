import { chromium, webkit, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.env.MOBILE_TEST_URL ?? 'http://127.0.0.1:5188';
const out = 'rebuild/generated/qa-mobile-fixes';
await mkdir(out, { recursive: true });
const results = [];
for (const [name, engine] of Object.entries({ webkit, chromium })) {
  const browser = await engine.launch(
    name === 'chromium' ? { args: ['--ignore-gpu-blocklist', '--enable-gpu'] } : {},
  );
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  // Model native safe areas without changing real app data or mocking rendering.
  await context.route(/\.css(?:\?|$)/, async (route) => {
    const response = await route.fetch();
    const body = (await response.text())
      .replaceAll('env(safe-area-inset-top)', 'var(--test-safe-top, 0px)')
      .replaceAll('env(safe-area-inset-bottom)', 'var(--test-safe-bottom, 0px)')
      .replaceAll('env(safe-area-inset-left)', 'var(--test-safe-left, 0px)')
      .replaceAll('env(safe-area-inset-right)', 'var(--test-safe-right, 0px)');
    await route.fulfill({ response, body });
  });
  await context.addInitScript(() => {
    localStorage.setItem('reminduh-sound-v1', JSON.stringify({ readThoughts: false }));
    window.__audioContexts = [];
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor(...args) {
        super(...args);
        const analyser = this.createAnalyser();
        analyser.fftSize = 2048;
        analyser.connect(this.destination);
        Object.defineProperty(this, 'destination', { value: analyser });
        window.__audioContexts.push({ ctx: this, analyser });
      }
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => {
    errors.push(e.message);
    console.log(name, 'page error', e.stack);
  });
  page.on('requestfailed', (r) =>
    console.log(name, 'request failed', r.url(), r.failure()?.errorText),
  );
  const seedNative = async (top = 59, bottom = 34, left = 0, right = 0) =>
    page.evaluate(
      ([top, bottom, left, right]) => {
        document.documentElement.dataset.native = 'true';
        for (const [key, value] of Object.entries({ top, bottom, left, right }))
          document.documentElement.style.setProperty('--test-safe-' + key, value + 'px');
      },
      [top, bottom, left, right],
    );
  const go = async (path) => {
    await page.waitForLoadState('networkidle');
    await page.goto(base + path);
    await page.waitForFunction(() => window.__appStore);
    await seedNative();
  };
  const rms = () =>
    page.evaluate(() =>
      window.__audioContexts.map(({ ctx, analyser }) => {
        const samples = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(samples);
        return ctx.state === 'running'
          ? Math.sqrt(samples.reduce((n, v) => n + v * v, 0) / samples.length)
          : 0;
      }),
    );
  const audit = async (label) => {
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    await writeFile(
      out + '/' + name + '-' + label + '-axe.json',
      JSON.stringify(violations, null, 2),
    );
    assert.deepEqual(
      violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
      [],
    );
  };
  try {
    // Settings is available before onboarding. Seed here so the fixture does not
    // navigate away mid-load from the welcome redirect's lazy 3D room (WebKit
    // reports those aborted fetches as access-control errors on Linux).
    await go('/profile');
    await page.evaluate(() =>
      window.__appStore.getState().completeWelcome('Mobile test', 'Blobby'),
    );
    await page.getByRole('button', { name: 'Sound settings', exact: true }).click();
    const dialog = page.locator('.sound-dialog');
    await expect(
      dialog.getByRole('checkbox', { name: 'Enable audio', exact: true }),
    ).not.toBeChecked();
    await expect(
      dialog.getByRole('checkbox', { name: 'Background music', exact: true }),
    ).not.toBeChecked();
    const geometry = await dialog
      .locator('.toggle-row input')
      .evaluateAll((es) =>
        es.map((e) => ({
          w: e.getBoundingClientRect().width,
          h: e.getBoundingClientRect().height,
          target: e.closest('label').getBoundingClientRect().height,
          pseudo: getComputedStyle(e, '::before').content,
        })),
      );
    assert.ok(
      geometry.every(
        (g) =>
          g.w === 52 &&
          g.h === 32 &&
          g.target >= 44 &&
          (g.pseudo === 'none' || g.pseudo === 'normal'),
      ),
    );
    await dialog.getByRole('checkbox', { name: 'Background music', exact: true }).click();
    await expect(dialog.getByRole('checkbox', { name: 'Enable audio', exact: true })).toBeChecked();
    await expect.poll(async () => Math.max(...(await rms()))).toBeGreaterThan(0.00001);
    assert.equal(await page.evaluate(() => window.__audioContexts[0].ctx.state), 'running');
    const session = await page.evaluate(() => navigator.audioSession?.type);
    if (session !== undefined) assert.equal(session, 'playback');
    await page.screenshot({ path: out + '/' + name + '-sound.png' });
    await audit('sound');
    // Interruption recovery must keep user opt-in and must not restart muted audio.
    await page.evaluate(() => window.__audioContexts[0].ctx.suspend());
    await dialog.getByRole('heading', { name: 'Sound', exact: true }).tap();
    await expect
      .poll(() => page.evaluate(() => window.__audioContexts[0].ctx.state))
      .toBe('running');
    await expect.poll(async () => Math.max(...(await rms()))).toBeGreaterThan(0.00001);
    await dialog.getByRole('checkbox', { name: 'Enable audio', exact: true }).uncheck();
    await expect.poll(async () => Math.max(...(await rms()))).toBeLessThan(0.00001);
    await page.evaluate(() => window.__audioContexts[0].ctx.suspend());
    await dialog.getByRole('heading', { name: 'Sound', exact: true }).tap();
    assert.equal(await page.evaluate(() => window.__audioContexts[0].ctx.state), 'suspended');
    await dialog.getByRole('checkbox', { name: 'Sound effects', exact: true }).click();
    await expect(dialog.getByRole('checkbox', { name: 'Enable audio', exact: true })).toBeChecked();
    await dialog.getByRole('checkbox', { name: 'Background music', exact: true }).uncheck();
    const preview = dialog.getByRole('button', { name: /Preview/ }).first();
    await preview.click();
    await expect.poll(async () => Math.max(...(await rms()))).toBeGreaterThan(0.00001);
    await dialog.getByRole('button', { name: 'Close sound settings' }).click();
    results.push(
      name +
        ': switch geometry, opt-in music/voice output, playback session, interruption recovery and mute',
    );
    await go('/music');
    await page.getByRole('button', { name: 'Play Blobby radio', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause record', exact: true })).toBeVisible();
    await expect.poll(async () => Math.max(...(await rms()))).toBeGreaterThan(0.00001);
    await page.getByRole('button', { name: 'Pause record', exact: true }).click();
    await expect.poll(async () => Math.max(...(await rms()))).toBeLessThan(0.00001);
    await go('/');
    await page.evaluate(async () => {
      const s = window.__appStore.getState(),
        d = structuredClone(s.data);
      d.room.garden = 'sand_garden';
      d.market.ownedRoomItems.push('sand_garden');
      d.preferences.staticScene = false;
      d.preferences.showWisdom = false;
      s.restore(d);
      const { dateKey } = await import('/src/domain/schedule.ts');
      s.saveRoutine({
        title: 'Sand test',
        category: 'rest',
        activity: 'sand',
        days: [0, 1, 2, 3, 4, 5, 6],
        startDate: dateKey(),
      });
    });
    const before = await page.evaluate(() => JSON.stringify(window.__appStore.getState().data));
    const trigger = page
      .getByRole('article', { name: 'Sand test' })
      .getByRole('button', { name: 'Take a break with Blobby' });
    await trigger.click();
    const sand = page.locator('.room-game'),
      board = page.locator('.sensory-sand-board');
    await page.locator('[data-sand-ready=true]').waitFor();
    const image = () => board.evaluate((c) => c.toDataURL());
    const pristine = await image();
    await board.focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Space');
    assert.notEqual(await image(), pristine);
    await sand.getByRole('button', { name: 'Undo', exact: true }).click();
    assert.equal(await image(), pristine);
    // Pointer drawing, routed through the same primary pointer handlers used by touch.
    let box = await board.boundingBox();
    await page.mouse.move(box.x + 60, box.y + 70);
    await page.mouse.down();
    for (let i = 1; i <= 18; i++) await page.mouse.move(box.x + 60 + i * 8, box.y + 70 + i * 3);
    await page.mouse.up();
    await page.waitForTimeout(250);
    assert.notEqual(await image(), pristine);
    // Full viewport, safe header, equal canvas geometry, no horizontal overflow in rotation.
    for (const [width, height, top, bottom, left, right] of [
      [390, 844, 59, 34, 0, 0],
      [844, 390, 0, 21, 59, 59],
      [320, 568, 20, 0, 0, 0],
    ]) {
      await page.setViewportSize({ width, height });
      await seedNative(top, bottom, left, right);
      await page.waitForTimeout(100);
      await sand.evaluate((e) => (e.scrollTop = 0));
      const rect = await sand.boundingBox(),
        close = await sand.getByRole('button', { name: 'Back to room', exact: true }).boundingBox();
      assert.ok(Math.abs(rect.height - height) < 1);
      assert.equal(rect.y, 0);
      assert.ok(close.y >= top && close.x + close.width <= width - right);
      assert.equal(await sand.evaluate((e) => e.scrollWidth > e.clientWidth), false);
      const boxes = await page
        .locator('.sand-surface,.sensory-sand-board,.sand-cursor')
        .evaluateAll((es) =>
          es.map((e) => {
            const r = e.getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height };
          }),
        );
      assert.deepEqual(boxes[1], boxes[0]);
      assert.deepEqual(boxes[2], boxes[0]);
      await sand.getByRole('button', { name: 'Fresh sand', exact: true }).scrollIntoViewIfNeeded();
      await expect(sand.getByRole('button', { name: 'Fresh sand', exact: true })).toBeInViewport();
      await sand.evaluate((e) => (e.scrollTop = 0));
      await page.screenshot({ path: out + '/' + name + '-sand-' + width + '.png' });
    }
    await audit('sand');
    await sand.getByRole('button', { name: 'Sound off', exact: true }).click();
    await expect(sand.getByRole('button', { name: 'Sound on', exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => window.__audioContexts.at(-1).ctx.state), 'running');
    await board.focus();
    await page.keyboard.press('Space');
    let peak = 0;
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowRight');
      peak = Math.max(peak, ...(await rms()));
      await page.waitForTimeout(20);
    }
    await page.keyboard.press('Space');
    assert.ok(peak > 0.00001);
    await sand.getByRole('button', { name: 'Sound on', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.__audioContexts.at(-1).ctx.state))
      .toBe('closed');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Return without recording', exact: true }).click();
    assert.equal(
      await page.evaluate(() => JSON.stringify(window.__appStore.getState().data)),
      before,
    );
    await expect(trigger).toBeFocused();
    assert.deepEqual(errors, []);
    results.push(
      name +
        ': safe-area sand layout, rotation, drawing/undo, audio, accessible controls, exit without records/rewards',
    );
  } catch (e) {
    await page.screenshot({ path: out + '/' + name + '-failure.png' });
    throw e;
  } finally {
    await browser.close();
  }
}
await writeFile(out + '/results.json', JSON.stringify({ status: 'passed', results }, null, 2));
console.log(results.join('\n'));
