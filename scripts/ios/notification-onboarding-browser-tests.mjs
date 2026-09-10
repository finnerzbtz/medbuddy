import { chromium, webkit, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.MOBILE_TEST_URL ?? 'http://127.0.0.1:5188';
const out = 'rebuild/generated/qa-notification-onboarding';
await mkdir(out, { recursive: true });
const checks = [];
for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch(
    engineName === 'chromium' ? { args: ['--enable-gpu', '--ignore-gpu-blocklist'] } : {},
  );
  for (const choice of ['allow', 'skip', 'denied', 'unsupported', 'failure']) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await context.addInitScript((choice) => {
      window.__permissionRequests = 0;
      class NotificationStub {
        static permission = 'default';
        static async requestPermission() {
          window.__permissionRequests++;
          if (choice === 'failure') throw new Error('Test failure');
          this.permission = choice === 'denied' ? 'denied' : 'granted';
          return this.permission;
        }
        constructor() {
          setTimeout(() => this.onshow?.(), 0);
        }
        close() {}
      }
      if (choice === 'unsupported') delete window.Notification;
      else
        Object.defineProperty(window, 'Notification', {
          value: NotificationStub,
          configurable: true,
        });
    }, choice);
    try {
      await page.goto(base + '/welcome');
      await page.getByRole('button', { name: 'Make yourself at home' }).click();
      await expect(page).toHaveURL(/\/meds\/new\?welcome=1$/);
      assert.equal(await page.evaluate(() => window.__permissionRequests), 0);
      if (choice === 'allow') {
        await page.getByRole('combobox', { name: 'Medication name' }).fill('Test medicine');
        await page
          .getByRole('spinbutton', { name: 'Strength per tablet (mg)', exact: true })
          .fill('10');
        await page
          .getByRole('spinbutton', { name: 'Number of tablets per dose', exact: true })
          .fill('1');
        await page.getByRole('button', { name: 'Add medication', exact: true }).click();
      } else await page.getByRole('link', { name: 'I’ll add this later' }).click();
      await expect(page).toHaveURL(/\/welcome\/reminders$/);
      assert.equal(
        await page.evaluate(() => window.__permissionRequests),
        0,
        'Opening onboarding must not trigger the OS prompt',
      );
      const before = await page.evaluate(() => structuredClone(window.__appStore.getState().data));
      assert.equal(before.preferences.reminders, false);
      if (choice === 'skip') {
        await page.getByRole('link', { name: 'Not now', exact: true }).click();
        assert.equal(await page.evaluate(() => window.__permissionRequests), 0);
        assert.equal(
          await page.evaluate(() => window.__appStore.getState().data.preferences.reminders),
          false,
        );
      } else if (choice === 'unsupported') {
        await expect(
          page.getByRole('link', { name: 'Calendar reminders', exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'Enable browser reminders', exact: true }),
        ).toHaveCount(0);
        await page.getByRole('link', { name: 'Continue to Blobby' }).click();
      } else {
        await page.getByRole('button', { name: 'Enable browser reminders', exact: true }).click();
        assert.equal(await page.evaluate(() => window.__permissionRequests), 1);
        if (choice === 'allow') {
          await expect(
            page.getByRole('heading', { name: 'Reminders are on', exact: true }),
          ).toBeVisible();
          assert.equal(
            await page.evaluate(() => window.__appStore.getState().data.preferences.reminders),
            true,
          );
          await page.getByRole('button', { name: 'Test notification', exact: true }).click();
          await expect(
            page.getByRole('status').filter({ hasText: 'Test notification sent.' }),
          ).toBeVisible();
          await page.getByRole('link', { name: 'Go to Blobby', exact: true }).click();
        } else {
          await expect(
            page.getByText(
              choice === 'denied' ? 'Reminders are blocked' : 'Reminders aren’t ready yet.',
              { exact: choice === 'denied' },
            ),
          ).toBeVisible();
          assert.equal(
            await page.evaluate(() => window.__appStore.getState().data.preferences.reminders),
            false,
          );
          const axe = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
            .analyze();
          assert.deepEqual(
            axe.violations.map((v) => v.id),
            [],
          );
          await page.screenshot({ path: out + '/' + engineName + '-' + choice + '.png' });
          await page.getByRole('link', { name: 'Continue to Blobby', exact: true }).click();
        }
      }
      await expect(page).toHaveURL(base + '/');
      const after = await page.evaluate(() => structuredClone(window.__appStore.getState().data));
      for (const key of ['medications', 'records', 'selfCare', 'care', 'market'])
        assert.deepEqual(after[key], before[key], key + ' unaffected by notification choice');
      await page.reload();
      await page.waitForFunction(() => window.__appStore);
      assert.equal(
        await page.evaluate(() => window.__appStore.getState().data.preferences.reminders),
        choice === 'allow',
      );
      await expect(page).toHaveURL(base + '/');
      checks.push(
        engineName +
          ': ' +
          choice +
          ' onboarding path, no automatic prompt, no medication/self-care changes, persisted choice',
      );
      console.log('✓ ' + checks.at(-1));
    } catch (e) {
      await page.screenshot({ path: out + '/' + engineName + '-failure.png' });
      throw e;
    } finally {
      await context.close();
    }
  }
  await browser.close();
}
await writeFile(out + '/results.json', JSON.stringify({ passed: checks.length, checks }, null, 2));
