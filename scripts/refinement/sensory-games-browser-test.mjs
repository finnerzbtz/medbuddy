import { chromium, webkit, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Own the origin and synthetic save. Disable watching so concurrent Xcode output
// cannot reload a browser that is measuring an in-progress sensory interaction.
const server = await createServer({
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
  define: {
    'import.meta.env.VITE_NEON_AUTH_URL': '""',
    'import.meta.env.VITE_NEON_DATA_URL': '""',
  },
});
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const output = 'rebuild/generated/refinement/sensory-games';
await mkdir(output, { recursive: true });
const fixture = JSON.parse(await readFile('scripts/release-a/fixtures/v1.json', 'utf8'));
fixture.preferences.showWisdom = false;
fixture.preferences.reducedMotion = false;
fixture.preferences.staticScene = false;
const results = [];
try {
  for (const [engine, type] of Object.entries({ chromium, webkit })) {
    const browser = await type.launch(
      engine === 'chromium' ? { args: ['--ignore-gpu-blocklist', '--enable-gpu'] } : {},
    );
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      reducedMotion: 'no-preference',
    });
    await context.addInitScript((data) => {
      localStorage.setItem('reminduh-mvp-v1', JSON.stringify(data));
      localStorage.setItem(
        'reminduh-sound-v1',
        JSON.stringify({ enabled: false, music: false, effects: false, readThoughts: false }),
      );
      // Exercise real low-frequency rendering, without advancing the journey
      // directly or replacing the arrival callback.
      window.__sensoryFrameDelay = 0;
      window.__sensoryJourneyFrames = [];
      const requestFrame = window.requestAnimationFrame.bind(window);
      const cancelFrame = window.cancelAnimationFrame.bind(window);
      const pending = new Map();
      let nextFrame = 0;
      window.requestAnimationFrame = (callback) => {
        if (!window.__sensoryFrameDelay) return requestFrame(callback);
        const id = --nextFrame;
        const entry = { timer: 0, frame: 0 };
        entry.timer = setTimeout(() => {
          entry.frame = requestFrame((time) => {
            pending.delete(id);
            callback(time);
            const journey = window.__assetCharacter?.journey;
            if (journey)
              window.__sensoryJourneyFrames.push({
                activity: journey.activity,
                phase: journey.phase,
                position: [...journey.position],
                elapsed: journey.elapsed,
              });
          });
        }, window.__sensoryFrameDelay);
        pending.set(id, entry);
        return id;
      };
      window.cancelAnimationFrame = (id) => {
        const entry = pending.get(id);
        if (!entry) return cancelFrame(id);
        clearTimeout(entry.timer);
        if (entry.frame) cancelFrame(entry.frame);
        pending.delete(id);
      };
      window.__sensoryAudio = [];
      const Base = window.AudioContext;
      window.AudioContext = class extends Base {
        constructor(...args) {
          super(...args);
          const analyser = this.createAnalyser();
          analyser.fftSize = 2048;
          analyser.connect(this.destination);
          Object.defineProperty(this, 'destination', { value: analyser });
          window.__sensoryAudio.push({ context: this, analyser });
        }
      };
    }, fixture);
    const page = await context.newPage();
    const errors = [],
      external = [],
      checks = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
      if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== base) external.push(r.url());
    });
    const check = (label) => {
      checks.push(label);
      console.log(`PASS ${engine}: ${label}`);
    };
    const health = () =>
      page.evaluate(() => {
        const d = window.__appStore.getState().data;
        return {
          medications: d.medications,
          records: d.records,
          reminders: d.reminders,
          selfCare: d.selfCare,
          market: d.market,
          care: d.care,
        };
      });
    try {
      await page.goto(base);
      await page.waitForFunction(() => window.__appStore);
      await page.evaluate(() => {
        const s = window.__appStore.getState(),
          d = structuredClone(s.data);
        d.room.table = 'record_player';
        if (!d.market.ownedRoomItems.includes('record_player'))
          d.market.ownedRoomItems.push('record_player');
        s.restore(d);
      });
      const before = await health();
      await page.getByRole('button', { name: 'Activities', exact: true }).click();
      const garden = page.getByRole('button', { name: 'Garden: Tend the bonsai', exact: true });
      await expect(page.locator('.live-scene')).toHaveAttribute('data-scene-ready', 'true', {
        timeout: 20000,
      });
      await page.evaluate(() => {
        window.__sensoryFrameDelay = 750;
      });
      await garden.click();
      const dialog = page.locator('.bonsai-garden'),
        canvas = page.locator('.bonsai-canvas');
      await expect(dialog).toHaveAttribute('data-ready', 'true', { timeout: 18000 });
      const arrival = await page.evaluate(async () => {
        window.__sensoryFrameDelay = 0;
        const journey = window.__assetCharacter.journey;
        const { PLACES } = await import('/src/domain/choreography.ts');
        return {
          phase: journey.phase,
          activity: journey.animation,
          position: journey.position,
          destination: PLACES.garden,
          travelled: window.__sensoryJourneyFrames.some(
            (frame) => frame.activity === 'tend' && frame.phase === 'travel',
          ),
        };
      });
      expect(arrival.travelled).toBe(true);
      expect(arrival.phase).toBe('act');
      expect(arrival.activity).toBe('tend');
      expect(arrival.position).toEqual(arrival.destination);
      check('A slow-rendered approach reaches the actual bonsai before opening its activity');
      const metric = async (name) => Number(await canvas.getAttribute('data-' + name));
      await page.getByRole('button', { name: 'Clear droplets', exact: true }).click();
      await page.getByRole('button', { name: 'Shower the tree', exact: true }).click();
      await expect.poll(() => metric('wet-leaves')).toBeGreaterThan(3);
      await expect.poll(() => metric('particles')).toBeGreaterThan(30);
      await page.screenshot({ path: `${output}/${engine}-rain.png` });
      await page.getByRole('button', { name: 'Stop', exact: true }).click();
      const wet = await metric('moisture');
      await page.getByRole('button', { name: 'Breeze', exact: true }).click();
      await page.getByRole('button', { name: 'Brush the tree', exact: true }).click();
      await expect.poll(() => metric('blown-particles')).toBeGreaterThan(0);
      await expect.poll(() => metric('canopy-sway')).toBeGreaterThan(0.1);
      await expect.poll(() => metric('moisture')).toBeLessThan(wet * 0.5);
      await page.screenshot({ path: `${output}/${engine}-breeze.png` });
      await page.getByRole('button', { name: 'Stop', exact: true }).click();
      check(
        'Rain produces wet leaves and visible drops; breeze detaches beads, clears water and moves the canopy',
      );
      await page.getByRole('button', { name: 'Rain', exact: true }).click();
      await page.getByRole('button', { name: 'Shower the tree', exact: true }).click();
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await expect(canvas).toHaveAttribute('data-active', 'false');
      const frames = await canvas.getAttribute('data-frames');
      await page.waitForTimeout(250);
      expect(await canvas.getAttribute('data-frames')).toBe(frames);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(
        page.getByRole('button', { name: 'Shower the tree', exact: true }),
      ).toBeVisible();
      await expect(canvas).toHaveAttribute('data-active', 'false');
      await page.evaluate(() => window.__appStore.getState().setPreference('reducedMotion', true));
      await page.getByRole('button', { name: 'Shower the tree', exact: true }).click();
      await page.waitForTimeout(600);
      await page.getByRole('button', { name: 'Stop', exact: true }).click();
      const reducedWet = await metric('moisture');
      await page.getByRole('button', { name: 'Breeze', exact: true }).click();
      await page.getByRole('button', { name: 'Brush the tree', exact: true }).click();
      await expect.poll(() => metric('moisture')).toBeLessThan(reducedWet * 0.5);
      expect(await metric('particles')).toBe(0);
      expect(await metric('canopy-sway')).toBe(0);
      await page.getByRole('button', { name: 'Stop', exact: true }).click();
      check(
        'Background cancels held actions; reduced-motion rain/breeze retains wet-leaf feedback without particles or sway',
      );
      await page.getByRole('button', { name: 'Back to room', exact: true }).click();
      await expect(garden).toBeFocused();
      await page.evaluate(() => window.__appStore.getState().setPreference('staticScene', true));
      await garden.click();
      await expect(dialog).toHaveAttribute('data-ready', 'true', { timeout: 5000 });
      await page.waitForTimeout(18000);
      await expect(dialog).toBeVisible();
      await page.getByRole('button', { name: 'Shower the tree', exact: true }).click();
      await expect.poll(() => metric('moisture')).toBeGreaterThan(0);
      await page.getByRole('button', { name: 'Stop', exact: true }).click();
      await page.getByRole('button', { name: 'Back to room', exact: true }).click();
      await expect(garden).toBeFocused();
      check('The still-room option keeps the bonsai activity available and restores focus on exit');
      const music = page.getByRole('button', { name: 'Music: Open record player', exact: true });
      await music.click();
      await page.getByRole('button', { name: 'Make a melody', exact: true }).click();
      const melody = page.locator('.melody-game');
      await page.getByRole('button', { name: 'Play La', exact: true }).click();
      await expect(melody).toHaveAttribute('data-step', '0');
      await expect(melody).toContainText('No need to start over.');
      await page.getByRole('button', { name: 'Sound off', exact: true }).click();
      await page.getByRole('button', { name: 'Hear pattern', exact: true }).click();
      await expect
        .poll(() =>
          page.evaluate(() =>
            Math.max(
              0,
              ...window.__sensoryAudio.map(({ context, analyser }) => {
                if (context.state !== 'running') return 0;
                const data = new Float32Array(analyser.fftSize);
                analyser.getFloatTimeDomainData(data);
                return Math.sqrt(data.reduce((sum, n) => sum + n * n, 0) / data.length);
              }),
            ),
          ),
        )
        .toBeGreaterThan(0.001);
      await page.getByRole('button', { name: 'Sound on', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Hear pattern', exact: true })).toHaveCount(0);
      check(
        'Melody sound produces actual output, can be stopped mid-pattern, and wrong notes retain progress',
      );
      for (const [index, sequence] of [
        ['Do', 'Mi', 'Sol'],
        ['Sol', 'Mi', 'Do', 'La'],
        ['Do', 'Sol', 'La', 'Mi', 'Do'],
      ].entries()) {
        for (const [step, note] of sequence.entries()) {
          const pad = page.getByRole('button', { name: 'Play ' + note, exact: true });
          await pad.focus();
          await expect(pad).toBeFocused();
          await page.keyboard.press('Enter');
          await expect(melody).toHaveAttribute('data-step', String(step + 1));
        }
        if (index < 2) {
          await expect(
            page.getByRole('button', { name: 'Next melody', exact: true }),
          ).toBeFocused();
          await page.keyboard.press('Enter');
          await expect(melody).toHaveAttribute('data-round', String(index + 1));
          const firstNote = index === 0 ? 'Sol' : 'Do';
          await expect(
            page.getByRole('button', { name: 'Play ' + firstNote, exact: true }),
          ).toBeFocused();
        }
      }
      await expect(
        page.getByRole('heading', { name: 'Your little mixtape.', exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Make another', exact: true }).click();
      await expect(melody).toHaveAttribute('data-round', '0');
      await expect(melody).toHaveAttribute('data-step', '0');
      check('All three untimed melodies complete by keyboard with focus progression and replay');
      for (const [width, height, size] of [
        [320, 568, 100],
        [390, 844, 200],
        [844, 390, 100],
      ]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => (document.documentElement.style.fontSize = '100%'));
        const normalInstructionsSize = await page
          .locator('.room-game-intro p')
          .evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
        await page.evaluate((size) => (document.documentElement.style.fontSize = size + '%'), size);
        expect(
          await page.locator('dialog.room-game').evaluate((e) => e.scrollWidth <= e.clientWidth),
        ).toBe(true);
        const artwork = await page.locator('.mixtape-title').evaluate((e) => ({
          width: e.viewBox.baseVal.width,
          height: e.viewBox.baseVal.height,
          lines: [...e.querySelectorAll('text')].map((line) => {
            const box = line.getBBox();
            return { x: box.x, y: box.y, right: box.x + box.width, bottom: box.y + box.height };
          }),
        }));
        for (const line of artwork.lines) {
          expect(line.x).toBeGreaterThanOrEqual(0);
          expect(line.y).toBeGreaterThanOrEqual(0);
          expect(line.right).toBeLessThanOrEqual(artwork.width);
          expect(line.bottom).toBeLessThanOrEqual(artwork.height);
        }
        const instructionsSize = await page
          .locator('.room-game-intro p')
          .evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
        expect(instructionsSize).toBeCloseTo((normalInstructionsSize * size) / 100, 1);

        for (const name of ['Play Do', 'Play La', 'Back to room']) {
          const control = page.getByRole('button', { name, exact: true });
          await control.scrollIntoViewIfNeeded();
          const r = await control.boundingBox();
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.x + r.width).toBeLessThanOrEqual(width + 1);
          expect(r.y).toBeGreaterThanOrEqual(0);
          expect(r.y + r.height).toBeLessThanOrEqual(height + 1);
        }
        await page.screenshot({ path: `${output}/${engine}-melody-${width}-${size}.png` });
      }
      const axe = await new AxeBuilder({ page })
        .include('dialog.room-game')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(axe.violations).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(music).toBeFocused();
      expect(await health()).toEqual(before);
      check(
        'Mobile/landscape/enlarged controls stay reachable; exit restores focus and leaves health, routines and rewards unchanged',
      );
      expect(errors).toEqual([]);
      expect(external).toEqual([]);
      results.push({ engine, checks, errors, external });
      await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
    } catch (error) {
      await page.screenshot({ path: `${output}/${engine}-failure.png`, fullPage: true });
      console.error(
        'Sensory diagnostic',
        await page.evaluate(() => ({
          preferences: window.__appStore?.getState().data.preferences,
          animation: window.__appStore?.getState().currentAnimation,
          journey: window.__assetCharacter?.journey,
          frames: window.__sensoryJourneyFrames?.slice(-8),
          scene: document.querySelector('.live-scene')?.outerHTML.slice(0, 800),
        })),
        errors,
      );
      throw error;
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
