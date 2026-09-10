import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const out = path.resolve('rebuild/generated/qa-medication-names');
await mkdir(out, { recursive: true });
await build({
  entryPoints: ['src/domain/medicationNames.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: path.join(out, 'matching.mjs'),
});
const { suggestMedicationNames: suggest } = await import(
  pathToFileURL(path.join(out, 'matching.mjs'))
);
const checks = [];
const check = (name, assertion) => {
  assertion?.();
  checks.push(name);
  console.log('PASS', name);
};
check('Prefix suggestions include the typed medicine', () =>
  assert.equal(suggest('cita')[0].name, 'Citalopram'),
);
check('A swapped pair of letters finds the intended name', () =>
  assert(suggest('citaloparm').some((x) => x.name === 'Citalopram' && x.similarSpelling)),
);
check('Missing letters are recognised', () =>
  assert(suggest('sertaline').some((x) => x.name === 'Sertraline' && x.similarSpelling)),
);
check('An exact name takes priority over other close names', () =>
  assert.equal(suggest('Sertraline')[0].name, 'Sertraline'),
);
check('Case and spacing do not prevent a match', () =>
  assert.equal(suggest('  CITA  ')[0].name, 'Citalopram'),
);
check('Too-short and unknown names do not create suggestions', () => {
  assert.deepEqual(suggest('s'), []);
  assert.deepEqual(suggest('zzqqzzqq'), []);
});
check('Previous names are available and duplicates collapse', () => {
  assert(suggest('daily', ['Daily vitamin']).some((x) => x.name === 'Daily vitamin' && x.previous));
  assert.equal(
    suggest('sertraline', ['sertraline', 'Sertraline']).filter(
      (x) => x.name.toLowerCase() === 'sertraline',
    ).length,
    1,
  );
});
check('At most five suggestions are shown', () => assert(suggest('co').length <= 5));
const catalogue = JSON.parse(await readFile('src/generated/medication-names.json', 'utf8'));
check('Catalogue entries have an NHS source and preserve form qualifiers', () => {
  assert(
    catalogue.names.every(
      (x) => x.name.length <= 80 && x.source.startsWith('https://www.nhs.uk/medicines/'),
    ),
  );
  assert(catalogue.names.some((x) => x.name === 'Hydrocortisone tablets'));
  assert(catalogue.names.some((x) => x.name === 'Hydrocortisone for skin'));
});

const origin = process.env.MVP_TEST_URL ?? 'http://127.0.0.1:5177';
const browser = await chromium.launch();
const errors = [],
  remote = [];
async function fixture(options = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    ...options,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (
      !request.url().startsWith(origin) &&
      !request.url().startsWith('data:') &&
      !request.url().startsWith('blob:')
    )
      remote.push(request.url());
  });
  await page.goto(origin + '/welcome');
  await page.evaluate(async () => {
    const { emptyData, STORAGE_KEY } = await import('/src/domain/storage.ts');
    const data = emptyData();
    data.onboarded = true;
    data.preferences.staticScene = true;
    data.profile.name = 'Autocomplete test';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  });
  await page.goto(origin + '/meds/new');
  return {
    context,
    page,
    input: page.getByRole('combobox', { name: 'Medication name', exact: true }),
  };
}
try {
  const { context, page, input } = await fixture();
  await input.fill('cita');
  await expect(page.getByRole('option', { name: 'Citalopram', exact: true })).toBeVisible();
  await expect(input).not.toHaveAttribute('aria-activedescendant');
  await input.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', 'med-name-option-0');
  await expect(input).toHaveValue('cita');
  await input.press('Enter');
  await expect(input).toHaveValue('Citalopram');
  await expect(input).toBeFocused();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page).toHaveURL(/meds\/new$/);
  check('Arrow keys and Enter explicitly choose a name without submitting the form');
  await page.getByLabel('Strength per tablet (mg)', { exact: true }).fill('20');
  await page.getByLabel('Number of tablets per dose', { exact: true }).fill('0.5');
  await input.fill('sertaline');
  await expect(page.getByRole('option', { name: /Sertraline.*Similar spelling/ })).toBeVisible();
  await page.getByRole('option', { name: /Sertraline.*Similar spelling/ }).click();
  await expect(input).toHaveValue('Sertraline');
  await expect(page.getByLabel('Strength per tablet (mg)', { exact: true })).toHaveValue('20');
  await expect(page.getByLabel('Number of tablets per dose', { exact: true })).toHaveValue('0.5');
  check('Spelling support selects only the name and preserves both dose fields');
  await input.fill('cita');
  await input.press('ArrowDown');
  await input.press('Escape');
  await expect(input).toHaveValue('cita');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await input.press('ArrowDown');
  await input.press('Tab');
  await expect(input).toHaveValue('cita');
  await expect(page.getByLabel('Strength per tablet (mg)', { exact: true })).toBeFocused();
  check('Escape and Tab leave typed text unchanged and preserve normal focus order');
  await input.fill('co');
  await input.press('ArrowDown');
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  assert.deepEqual(axe.violations, []);
  await page.screenshot({ path: path.join(out, 'suggestions-mobile.png'), fullPage: true });
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  check('Expanded combobox passes axe and reflows at mobile and desktop widths');
  await context.setOffline(true);
  await input.fill('citaloparm');
  await expect(page.getByRole('option', { name: /Citalopram.*Similar spelling/ })).toBeVisible();
  await input.press('Escape');
  await input.fill('My daily supplement');
  await input.press('Tab');
  await page.getByRole('button', { name: 'Add medication', exact: true }).click();
  await expect(page).toHaveURL(/\/meds$/);
  check('Offline suggestions work and an unlisted custom medication saves');
  await context.setOffline(false);
  await page.goto(origin + '/meds/new');
  await input.fill('my daily');
  await expect(
    page.getByRole('option', { name: /My daily supplement.*Used before/ }),
  ).toBeVisible();
  check('Saved custom names are offered next time');
  await page.goto(origin + '/meds');
  const edit = page.getByRole('link', { name: /Edit.*My daily supplement/ });
  if (await edit.count()) await edit.click();
  else await page.locator('a[href$="/edit"]').first().click();
  await expect(input).toHaveValue('My daily supplement');
  await input.fill('cita');
  await input.press('ArrowDown');
  await input.press('Enter');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page).toHaveURL(/\/meds$/);
  check('The same autocomplete works when editing a medication');
  await page.goto(origin + '/meds/new');
  await input.fill('   ');
  await page.getByLabel('Strength per tablet (mg)', { exact: true }).fill('10');
  await page.getByLabel('Number of tablets per dose', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Add medication', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Check this before saving' }),
  ).toBeFocused();
  await page.getByRole('link', { name: 'Enter a medication name of up to 80 characters.' }).click();
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  check('Name validation still links the focused error summary to the combobox');
  const touch = await fixture({ hasTouch: true, isMobile: true });
  await touch.input.fill('cita');
  await touch.page.getByRole('option', { name: 'Citalopram', exact: true }).tap();
  await expect(touch.input).toHaveValue('Citalopram');
  check('Touch selection completes the name');
  await touch.input.fill('cita');
  const cancelled = touch.page.getByRole('option', { name: 'Citalopram', exact: true });
  await cancelled.dispatchEvent('pointerdown', { pointerType: 'touch', button: 0 });
  await cancelled.dispatchEvent('pointercancel', { pointerType: 'touch' });
  await expect(touch.input).toHaveValue('cita');
  check('Cancelling a touch gesture does not select a medicine');
  await touch.input.fill('ser');
  await touch.input.dispatchEvent('compositionstart');
  await expect(touch.input).toHaveAttribute('aria-expanded', 'false');
  await touch.input.dispatchEvent('compositionend');
  await expect(touch.input).toHaveAttribute('aria-expanded', 'true');
  check('Composition input is not interrupted by suggestions');
  assert.deepEqual(errors, []);
  assert.deepEqual(remote, []);
  check('Medication searches produce no external requests or browser errors');
  await writeFile(
    path.join(out, 'results.json'),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        count: checks.length,
        checks,
        axeViolations: axe.violations,
      },
      null,
      2,
    ),
  );
  console.log(`${checks.length} medication autocomplete checks passed.`);
} finally {
  await browser.close();
}
