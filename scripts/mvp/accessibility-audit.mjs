import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.MVP_TEST_URL ?? 'http://127.0.0.1:5177';
const out = process.env.A11Y_OUT ?? 'rebuild/generated/qa-accessibility-axe';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
const context = await browser.newContext({
  viewport: { width: 1280, height: 1100 },
  timezoneId: 'Europe/London',
});
const page = await context.newPage(),
  scans = [],
  errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.clock.setFixedTime(new Date('2026-09-05T12:00:00+01:00'));
const scan = async (name) => {
  await page.waitForTimeout(300);
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  scans.push({ name, violations: r.violations, incomplete: r.incomplete });
  console.log(
    name,
    r.violations.map((v) => [v.id, v.nodes.length]),
  );
};
try {
  await page.goto(origin + '/welcome');
  await scan('Welcome');
  await page.evaluate(() => {
    const s = window.__appStore.getState();
    s.completeWelcome('Alex', 'Blobby');
    s.setPreference('reducedMotion', true);
    s.saveMedication({
      name: 'Example medicine',
      strengthMg: 10,
      tabletsPerDose: 1,
      instructions: 'With breakfast',
      color: '#738962',
      times: ['08:00', '20:00'],
      days: [0, 1, 2, 3, 4, 5, 6],
      startDate: '2026-09-05',
      supply: 30,
      refillAt: 5,
    });
  });
  for (const [path, name] of [
    ['/', 'Today'],
    ['/meds', 'Medications'],
    ['/meds/new', 'Add medication'],
    ['/log', 'History'],
    ['/profile', 'Profile'],
    ['/help', 'Help'],
  ]) {
    await page.goto(origin + path);
    await scan(name);
  }
  await page.goto(origin + '/profile');
  await page.getByRole('button', { name: 'Reset this device’s app data' }).click();
  await scan('Reset dialog');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.goto(origin + '/');
  await page.getByRole('button', { name: 'Check in now', exact: true }).click();
  await scan('Check-in dialog');
  await page.getByRole('button', { name: 'Record a skip', exact: true }).click();
  await scan('Skip dialog');
  await page.getByRole('button', { name: 'Close check-in' }).click();
  await page.getByRole('button', { name: 'Cheat codes', exact: true }).click();
  await scan('Mood previews');
  await page.getByRole('button', { name: 'Cheat codes', exact: true }).click();
  await page.getByRole('button', { name: 'Garden: Tend the bonsai', exact: true }).click();
  await page.waitForSelector('.garden-cutscene');
  await scan('Garden ready');
  await page.getByRole('button', { name: 'Back to room', exact: true }).click();
  await page.goto(origin + '/studio');
  await page.waitForTimeout(1000);
  await scan('Asset studio');
  await writeFile(out + '/audit.json', JSON.stringify({ scans, errors }, null, 2));
  await writeFile(
    out + '/summary.json',
    JSON.stringify(
      scans.map((s) => ({
        name: s.name,
        violations: s.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
            html: n.html,
          })),
        })),
      })),
      null,
      2,
    ),
  );
  if (errors.length || scans.some((s) => s.violations.length))
    throw new Error('Accessibility checks failed. Inspect ' + out + '/summary.json');
} finally {
  await browser.close();
}
