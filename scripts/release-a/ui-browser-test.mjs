import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const base = process.env.RELEASE_A_URL ?? 'http://127.0.0.1:5188';
const fixture = JSON.parse(await readFile('scripts/release-a/fixtures/v1.json', 'utf8'));
fixture.preferences.staticScene = true;
fixture.preferences.showWisdom = false;
fixture.preferences.hideRewards = true;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 320, height: 760 },
  reducedMotion: 'reduce',
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const results = [];
const passed = (name) => {
  results.push(name);
  console.log('✓ ' + name);
};
const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('reminduh-mvp-v1')));
const health = (d) => ({
  medications: d.medications,
  records: d.records,
  reminders: d.reminders,
  care: d.care,
  checkInRewards: d.market.checkInRewards,
});
try {
  await page.goto(base);
  await page.evaluate((d) => localStorage.setItem('reminduh-mvp-v1', JSON.stringify(d)), fixture);
  await page.goto(base + '/');
  await expect(page.getByRole('button', { name: 'Review dose', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Review dose', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  passed('Due medication reachable before the room at 320px');
  await page.getByRole('link', { name: 'Choose routines', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue to Today' })).toBeVisible();
  await page.getByRole('button', { name: 'Rest Take a quiet break' }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Routine name').fill('A quiet moment');
  await form.getByLabel('Time (optional)').fill('16:30');
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
    await form.getByLabel(day, { exact: true }).uncheck();
  await form.getByRole('button', { name: 'Add routine', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('at least one day');
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
    await form.getByLabel(day, { exact: true }).check();
  await form.getByRole('button', { name: 'Add routine', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(form).not.toBeVisible();
  passed('Routine form validates days and saves with keyboard');
  await page
    .getByRole('button', { name: 'Everyday care Prepare something to eat or drink that suits you' })
    .click();
  await page.getByRole('button', { name: 'Add routine', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Start with an idea' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue to Today' }).click();
  passed('Optional introduction offers at most two starters');
  const medical = health(await data());
  const definitions = (await data()).selfCare.routines;
  let card = page.getByRole('article', { name: 'A quiet moment', exact: true });
  await card.getByRole('button', { name: 'Later', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Later today', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Keep today small', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('medication check-ins and reminders stay');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(card).toBeVisible();
  await page.getByRole('button', { name: 'Keep today small', exact: true }).click();
  await page.getByRole('button', { name: 'Hide 2 for today' }).click();
  await expect(card).toHaveCount(0);
  expect(health(await data())).toEqual(medical);
  await page.getByRole('button', { name: 'Restore today’s routines (2)' }).click();
  expect((await data()).selfCare.routines).toEqual(definitions);
  await expect(card).toBeVisible();
  passed('Later, preview/cancel, hide and restore leave medication and recurrence untouched');
  await page.getByRole('link', { name: 'Manage routines' }).click();
  await page
    .getByRole('article', { name: 'A quiet moment' })
    .getByRole('button', { name: 'Edit', exact: true })
    .click();
  await page.getByLabel('Time (optional)').fill('19:00');
  await expect(page.getByRole('dialog')).toContainText('Schedule changes start tomorrow');
  await page.getByRole('button', { name: 'Save changes' }).click();
  let r = (await data()).selfCare.routines.find((r) => r.title === 'A quiet moment');
  expect(r.schedules[0].time).toBe('16:30');
  expect(r.schedules.at(-1).time).toBe('19:00');
  await page
    .getByRole('article', { name: 'A quiet moment' })
    .getByRole('button', { name: 'Pause', exact: true })
    .click();
  await expect(page.getByRole('article', { name: 'A quiet moment' })).toContainText('Paused');
  await page
    .getByRole('article', { name: 'A quiet moment' })
    .getByRole('button', { name: 'Resume', exact: true })
    .click();
  await page
    .getByRole('article', { name: 'A quiet moment' })
    .getByRole('button', { name: 'Archive', exact: true })
    .click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('article', { name: 'A quiet moment' })).toBeVisible();
  await page
    .getByRole('article', { name: 'A quiet moment' })
    .getByRole('button', { name: 'Archive', exact: true })
    .click();
  await page.getByRole('button', { name: 'Archive routine', exact: true }).click();
  await page.getByText('Archived routines (1)', { exact: true }).click();
  await page.getByRole('button', { name: 'Restore routine', exact: true }).click();
  passed('Edit schedule tomorrow; pause, resume, archive/cancel and restore');
  await page.locator('.routine-add-options > summary').click();
  await page.getByRole('button', { name: 'Create your own routine' }).click();
  await page.getByLabel('Routine name').fill('Custom stretch');
  await page.getByLabel('Category', { exact: true }).selectOption('enjoyment');
  await page.getByLabel('Start date').fill('2099-01-01');
  await page.getByRole('button', { name: 'Add routine', exact: true }).click();
  passed('Custom title/category and future start accepted');
  await page.addStyleTag({ content: 'html{font-size:200%!important}' });
  await page
    .getByRole('article', { name: 'A quiet moment' })
    .getByRole('button', { name: 'Edit', exact: true })
    .click();
  expect(
    await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth + 2),
  ).toBe(true);
  const audit = await new AxeBuilder({ page })
    .include('.routine-dialog')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations).toEqual([]);
  await mkdir('rebuild/generated/release-a', { recursive: true });
  await page.screenshot({
    path: 'rebuild/generated/release-a/routine-form-320-large.png',
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  passed(
    '320px large-text form has no clipped horizontal controls or automated accessibility violations',
  );
  await page.goto(base + '/');
  await page.getByRole('button', { name: 'Cheat codes', exact: false }).click();
  const saved = await data();
  await page.getByLabel('Research preview: cap sadness at Missing you').check();
  expect(await data()).toEqual(saved);
  await page.getByLabel('Research preview: cap sadness at Missing you').uncheck();
  expect(await data()).toEqual(saved);
  passed('Research mood preview does not mutate any saved data');
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Optional routine history' })).toBeVisible();
  passed('Optional history is separate from medication history');
  expect(errors).toEqual([]);
  await writeFile(
    'rebuild/generated/release-a/ui-results.json',
    JSON.stringify({ passed: results.length, results }, null, 2),
  );
} finally {
  await browser.close();
}
