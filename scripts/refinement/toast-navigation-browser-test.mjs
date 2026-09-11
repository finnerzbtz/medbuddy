import { chromium, webkit, expect } from '@playwright/test';
import { createServer } from 'vite';
import { createServer as createSocket } from 'node:net';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

process.env.VITE_NEON_AUTH_URL = '';
process.env.VITE_NEON_DATA_URL = '';
const socket = createSocket();
await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const server = await createServer({
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
    hmr: false,
    watch: null,
  },
});
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const output = 'rebuild/generated/refinement/toast-navigation';
await mkdir(output, { recursive: true });
const fixture = JSON.parse(await readFile('scripts/release-a/fixtures/v1.json', 'utf8'));
fixture.preferences.staticScene = true;
fixture.preferences.reducedMotion = true;
fixture.preferences.showWisdom = false;
fixture.preferences.hideRewards = true;
const results = [];
try {
  for (const [engine, type] of Object.entries({ chromium, webkit })) {
    const browser = await type.launch();
    let page;
    try {
      const context = await browser.newContext({
        viewport: { width: 320, height: 844 },
        timezoneId: 'Europe/London',
        locale: 'en-GB',
        reducedMotion: 'reduce',
      });
      page = await context.newPage();
      page.setDefaultTimeout(8000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.clock.install({ time: new Date('2026-09-10T12:00:00+01:00') });
      await page.goto(base + '/profile');
      await page.waitForFunction(() => window.__appStore);
      await page.evaluate(
        (data) => localStorage.setItem('reminduh-mvp-v1', JSON.stringify(data)),
        fixture,
      );
      await page.goto(base + '/routines');
      await expect(page.getByRole('button', { name: 'Rest Take a quiet break' })).toBeVisible();
      const health = () =>
        page.evaluate(() => {
          const data = window.__appStore.getState().data;
          return [data.medications, data.records, data.reminders];
        });
      const before = await health();
      await page.getByRole('button', { name: 'Rest Take a quiet break' }).click();
      await page.getByRole('dialog').getByLabel('Routine name').fill('QA quiet break');
      await page.getByRole('button', { name: 'Add routine', exact: true }).click();
      await expect(page.locator('.app-toast')).toContainText('Routine added.');
      await page.clock.fastForward(95_000);
      await expect(page.locator('.app-toast')).toContainText('Routine added.');
      await page.getByRole('link', { name: 'Today', exact: true }).click();
      await expect(page.locator('.app-toast')).toHaveCount(0);
      await expect(page.locator('#main-content')).toBeFocused();
      expect(await health()).toEqual(before);
      results.push(
        `${engine}: routine confirmation has no reading timer, clears on next page without changing medication or stealing focus`,
      );

      await page.getByRole('link', { name: 'Medications', exact: true }).click();
      await expect(page.locator('#main-content')).toBeFocused();
      await page.getByRole('link', { name: 'Add medication', exact: true }).focus();
      // A busy renderer may run navigation's frame after the user starts typing.
      // Hold page animation frames through keyboard navigation and initial entry.
      await page.evaluate(() => {
        const request = window.requestAnimationFrame.bind(window);
        const cancel = window.cancelAnimationFrame.bind(window);
        const pending = new Map();
        let id = -1;
        window.requestAnimationFrame = (callback) => {
          const token = id--;
          pending.set(token, callback);
          return token;
        };
        window.cancelAnimationFrame = (token) => {
          if (pending.has(token)) pending.delete(token);
          else cancel(token);
        };
        window.__releaseNavigationFrames = () => {
          window.requestAnimationFrame = request;
          window.cancelAnimationFrame = cancel;
          const count = pending.size;
          for (const callback of pending.values()) callback(performance.now());
          pending.clear();
          return count;
        };
      });
      await page.keyboard.press('Enter');
      const medicationName = page.getByRole('combobox', { name: 'Medication name' });
      await medicationName.fill('QA toast medication');
      await expect(medicationName).toHaveValue('QA toast medication');
      expect(await page.evaluate(() => window.__releaseNavigationFrames())).toBeGreaterThan(0);
      await expect(medicationName).toBeFocused();
      await expect(medicationName).toHaveValue('QA toast medication');
      await page.getByLabel('Strength per tablet (mg)').fill('10');
      await page.getByLabel('Number of tablets per dose').fill('1');
      await page.getByRole('button', { name: 'Add medication', exact: true }).click();
      await expect(page).toHaveURL(base + '/meds');
      await expect(page.locator('.app-toast')).toContainText('Medication added to your routine.');
      await expect(page.locator('#main-content')).toBeFocused();
      await page.getByRole('link', { name: 'History', exact: true }).click();
      await expect(page.locator('.app-toast')).toHaveCount(0);
      results.push(
        `${engine}: delayed route focus preserves field entry; save confirmation survives arrival and clears on later navigation`,
      );

      await page.getByRole('link', { name: 'Today', exact: true }).click();
      const beforeRecord = await health();
      await page.getByRole('button', { name: 'Review dose', exact: true }).click();
      await page.getByRole('button', { name: 'I’ve taken this dose', exact: true }).click();
      await expect(page.locator('.app-toast')).toContainText('Dose recorded.');
      await page.clock.fastForward(95_000);
      await page.getByRole('link', { name: 'History', exact: true }).click();
      await expect(
        page.locator('.app-toast').getByRole('button', { name: 'Undo', exact: true }),
      ).toBeVisible();
      await page.getByRole('link', { name: 'My Blobby', exact: true }).click();
      await expect(
        page.locator('.app-toast').getByRole('button', { name: 'Undo', exact: true }),
      ).toBeVisible();
      await page.locator('.app-toast').getByRole('button', { name: 'Undo', exact: true }).click();
      expect(await health()).toEqual(beforeRecord);
      await expect(page.locator('#main-content')).toBeFocused();
      results.push(
        `${engine}: medication Undo survives time and multiple routes and restores history/supply`,
      );

      await page.evaluate(() => document.documentElement.style.setProperty('font-size', '200%'));
      const dismiss = page.getByRole('button', { name: 'Dismiss message' });
      await expect(dismiss).toBeVisible();
      const hit = await dismiss.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return (
          el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) &&
          r.right <= innerWidth &&
          r.bottom <= innerHeight
        );
      });
      expect(hit).toBe(true);
      await page.screenshot({ path: `${output}/${engine}-enlarged-confirmation.png` });
      await dismiss.click();
      await expect(page.locator('.app-toast')).toHaveCount(0);
      await expect(page.locator('#main-content')).toBeFocused();
      results.push(
        `${engine}: enlarged confirmation keeps a reachable dismiss control and restores focus`,
      );
      await page.evaluate(() => document.documentElement.style.removeProperty('font-size'));
      await page.locator('#accessibility > summary').click();
      const calm = page.getByRole('button', { name: 'Use calm settings' });
      await calm.focus();
      await calm.click();
      await expect(page.locator('.app-toast')).toContainText('Calm settings applied.');
      await page.locator('#accessibility > summary').click();
      await expect(calm).not.toBeVisible();
      await page.getByRole('button', { name: 'Dismiss message' }).click();
      await expect(page.locator('#main-content')).toBeFocused();
      results.push(`${engine}: a hidden original trigger falls back to meaningful page focus`);

      const beforeRestore = await health();
      await page.locator('#your-data > summary').click();
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export backup', exact: true }).click();
      const backup = await downloadPromise;
      const contents = await readFile(await backup.path());
      const chooserPromise = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Restore backup', exact: true }).click();
      await (
        await chooserPromise
      ).setFiles({ name: 'qa-toast-restore.json', mimeType: 'application/json', buffer: contents });
      await page.getByRole('button', { name: 'Replace with backup', exact: true }).click();
      await expect(page).toHaveURL(base + '/');
      await expect(page.locator('.app-toast')).toContainText('Backup restored on this device.');
      expect(await health()).toEqual(beforeRestore);
      expect(
        await page.evaluate(() => window.__appStore.getState().data.preferences.reminders),
      ).toBe(false);
      await page.getByRole('link', { name: 'History', exact: true }).click();
      await expect(page.locator('.app-toast')).toHaveCount(0);
      results.push(
        `${engine}: real exported-backup restore retains arrival confirmation and medical data`,
      );
      expect(errors).toEqual([]);
      await context.close();
    } catch (error) {
      await page
        ?.screenshot({ path: `${output}/${engine}-failure.png`, fullPage: true })
        .catch(() => {});
      const state = await page
        ?.evaluate(() => ({
          path: location.pathname,
          activeId: document.activeElement?.id,
          active: document.activeElement?.outerHTML,
          messages: [...document.querySelectorAll('[role=alert],.app-toast')].map(
            (e) => e.textContent,
          ),
          inputs: [...document.querySelectorAll('input')].map((e) => ({
            id: e.id,
            type: e.type,
            value: e.value,
            valid: e.validity.valid,
            message: e.validationMessage,
          })),
        }))
        .catch(() => null);
      console.error(
        JSON.stringify(
          {
            engine,
            completed: results,
            path: state?.path,
            activeId: state?.activeId,
            messages: state?.messages,
            invalidInputs: state?.inputs.filter((input) => !input.valid),
          },
          null,
          2,
        ),
      );
      await writeFile(
        `${output}/${engine}-failure.json`,
        JSON.stringify({ error: error.stack, completed: results, state }, null, 2),
      );
      throw error;
    } finally {
      await browser.close();
    }
  }
  await writeFile(`${output}/results.json`, JSON.stringify({ passed: results }, null, 2));
  console.log(results.join('\n'));
} finally {
  await server.close();
}
