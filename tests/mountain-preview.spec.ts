import { test, expect } from '@playwright/test';

test('mountain sunlight preview', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    const ground = document.querySelector('#ground')!.getBoundingClientRect();
    const mountain = document.querySelector('#mountain')!.getBoundingClientRect();
    window.scrollTo({ top: scrollY + ground.bottom + (mountain.top - ground.bottom) * 0.88 - innerHeight * 0.38, behavior: 'instant' });
  });
  await expect(page.locator('.chapter-rail a[aria-current="location"]')).toHaveAttribute('href', '#mountain');
  await page.screenshot({ path: `/tmp/mountain-sun-${testInfo.project.name}.png` });
  expect(errors.filter(error => /THREE|WebGL|shader|TypeError|ReferenceError/.test(error))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
