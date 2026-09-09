import { test, expect } from '@playwright/test';
import { mountainTrailAngle } from '../src/journeyMath';

test('mountain trail has exactly two smooth turns from base to summit', () => {
  const facing = Math.atan2(14, 11);
  const angles = Array.from({ length: 601 }, (_, index) => mountainTrailAngle(index / 600, facing));
  let turns = 0;
  let previousDirection = 0;
  for (let index = 1; index < angles.length; index++) {
    const delta = angles[index] - angles[index - 1];
    const direction = Math.sign(delta);
    if (direction && previousDirection && direction !== previousDirection) turns++;
    if (direction) previousDirection = direction;
    expect(Math.abs(delta)).toBeLessThan(0.01);
    expect(Math.abs(angles[index] - facing)).toBeLessThanOrEqual(0.55 + 1e-8);
  }
  expect(turns).toBe(2);
  expect(angles.at(-1)).toBeCloseTo(facing);
  for (const turn of [1 / 3, 2 / 3]) {
    expect(Math.abs(mountainTrailAngle(turn - 0.0001, facing) - mountainTrailAngle(turn, facing))).toBeLessThan(1e-6);
    expect(Math.abs(mountainTrailAngle(turn + 0.0001, facing) - mountainTrailAngle(turn, facing))).toBeLessThan(1e-6);
  }
});

test('mountain sunlight preview', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  // SwiftShader can take longer to compile the scene's shadow programs under load.
  // This checks the climb layout; it is not a hardware startup-time benchmark.
  await expect(page.locator('canvas')).toBeVisible({ timeout: 45000 });
  await page.evaluate(() => document.fonts.ready);
  const climb = await page.evaluate(() => {
    const element = document.querySelector('.travel.climb')!;
    return { height: element.getBoundingClientRect().height, viewport: innerHeight, mobile: innerWidth <= 760 };
  });
  expect(climb.height / climb.viewport).toBeCloseTo(climb.mobile ? 0.85 : 0.9, 2);
  await expect(page.locator('.skill-card')).toHaveCount(8);
  await page.evaluate(() => {
    const ground = document.querySelector('#ground')!.getBoundingClientRect();
    const mountain = document.querySelector('#mountain')!.getBoundingClientRect();
    window.scrollTo({ top: scrollY + ground.bottom + (mountain.top - ground.bottom) * 0.88 - innerHeight * 0.38, behavior: 'instant' });
  });
  await expect(page.locator('.chapter-rail a[aria-current="location"]')).toHaveAttribute('href', '#mountain');
  await expect(page.locator('.skill-card:visible')).toHaveCount(0);
  await page.screenshot({ path: `/tmp/mountain-sun-${testInfo.project.name}.png` });
  expect(errors.filter(error => /THREE|WebGL|shader|TypeError|ReferenceError/.test(error))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
