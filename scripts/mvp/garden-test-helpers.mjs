import { expect } from '@playwright/test';
export const gardenReady = async (page) => {
  await expect(page.locator('.bonsai-garden')).toHaveAttribute('data-ready', 'true', {
    timeout: 12000,
  });
};
export const startGardenPour = async (page, control = 'mouse') => {
  await gardenReady(page);
  const canvas = page.locator('.bonsai-canvas');
  if (control === 'keyboard') {
    await canvas.focus();
    await page.keyboard.press('Space');
  } else {
    const r = await canvas.boundingBox();
    await page.mouse.move(r.x + r.width * 0.54, r.y + r.height * 0.37);
    await page.mouse.down();
  }
};
export const endGardenPour = async (page, control = 'mouse') => {
  if (control === 'keyboard') await page.keyboard.press('Space');
  else await page.mouse.up();
};
