import { test, expect } from '@playwright/test';

test('journey renders 3D and adapts to viewport', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('จากโค้ดบรรทัดแรก');
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('.world-fallback')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `/tmp/suthep-${testInfo.project.name}.png`, fullPage: false });
  await page.screenshot({ path: `/tmp/suthep-${testInfo.project.name}-full.png`, fullPage: true });
  await page.getByRole('button', { name: 'หยุดภาพเคลื่อนไหว' }).click();
  await expect(page.getByRole('button', { name: 'เปิดภาพเคลื่อนไหว' })).toHaveAttribute('aria-pressed', 'true');
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: 'เปิดเมนู' }).click();
    await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('link', { name: 'เส้นทางของผม' }).click();
    await expect(page.getByRole('button', { name: 'เปิดเมนู' })).toHaveAttribute('aria-expanded', 'false');
  } else {
    await page.getByRole('link', { name: 'ออกเดินทางด้วยกัน' }).click();
  }
  await expect(page.locator('.chapter-rail a[aria-current="location"]')).toHaveAttribute('href', '#mountain');
  await page.getByRole('button', { name: 'ดูงานทั้งหมด 7 โปรเจกต์' }).click();
  await expect(page.locator('.work-row')).toHaveCount(7);
  await page.locator('.work-row').filter({ hasText: 'iApp EKYB' }).click();
  await expect(page.getByRole('dialog')).toContainText('5,000');
  await page.getByRole('button', { name: 'ปิดรายละเอียด' }).click();
  expect(errors).toEqual([]);
});

test('project search, filters, expansion and accessible dialog work', async ({ page }) => {
  await page.goto('/#sky');
  await expect(page.locator('.project-card')).toHaveCount(6);
  await page.getByRole('button', { name: 'สำรวจทั้งหมด 24 โปรเจกต์' }).click();
  await expect(page.locator('.project-card')).toHaveCount(24);
  await page.getByRole('button', { name: 'API', exact: true }).click();
  await expect(page.locator('.project-card')).toHaveCount(2);
  await page.getByRole('button', { name: /^ทั้งหมด/ }).click();
  await page.getByRole('textbox', { name: 'ค้นหาโปรเจกต์' }).fill('Chatbot AI with RAG');
  await expect(page.locator('.project-card')).toHaveCount(1);
  await page.locator('.project-card').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Source code' })).toHaveAttribute('href', 'https://github.com/unikonkon/NextJS_Chatbot_AI_with_RAG');
  await expect(dialog.getByRole('link', { name: 'เปิดเว็บไซต์' })).toHaveAttribute('href', 'https://chatbot-ai-with-sell-products.vercel.app/');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.project-card')).toBeFocused();
  await page.getByRole('textbox', { name: 'ค้นหาโปรเจกต์' }).fill('no-matching-project-123');
  await expect(page.getByRole('heading', { name: 'ยังไม่พบโปรเจกต์ที่ค้นหา' })).toBeVisible();
  await page.getByRole('button', { name: 'ล้างการค้นหา' }).click();
  await expect(page.locator('.project-card')).toHaveCount(6);
});

test('reduced motion, resume download, and clipboard work', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'เปิดภาพเคลื่อนไหว' })).toHaveAttribute('aria-pressed', 'true');
  const downloading = page.waitForEvent('download');
  await page.getByRole('link', { name: 'ดาวน์โหลดเรซูเม่' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('Suthep-Jantawee-Resume.pdf');
  expect(await download.failure()).toBeNull();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'คัดลอกอีเมล' }).click();
  await expect(page.locator('.copy-feedback')).toContainText('คัดลอกแล้ว');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('bananammm0001@gmail.com');
});

test('content remains usable when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type.includes('webgl')) return null;
      return original.apply(this, [type, ...args] as Parameters<typeof original>);
    } as typeof original;
  });
  await page.goto('/');
  await expect(page.locator('.world-fallback')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('textbox', { name: 'ค้นหาโปรเจกต์' }).fill('Chatbot AI with RAG');
  await expect(page.locator('.project-card')).toHaveCount(1);
});
