import { test, expect } from '@playwright/test';

// "建立" only adds to list — must click the card to enter workspace.
// Use the existing "test" project (always present on prod).

const EXISTING_PROJECT_URL = '/projects/06176856-5996-4343-ba5d-57b549b3a383'; // test project

test('VERIFY: 進入 workspace 後預設在顧問模式，右欄存在', async ({ page }) => {
  await page.goto(EXISTING_PROJECT_URL);
  await expect(page.locator('.workspace')).toBeVisible({ timeout: 10000 });

  const cls = await page.locator('.workspace').getAttribute('class');
  console.log('Default workspace class:', cls);
  const hasNoRight = (cls ?? '').includes('workspace--no-right');
  console.log('Has workspace--no-right class:', hasNoRight);

  const rightCount = await page.locator('.workspace__right').count();
  const rightVisible = rightCount > 0 && await page.locator('.workspace__right').isVisible();
  console.log('workspace__right DOM count:', rightCount, 'visible:', rightVisible);

  // In consult mode (default), right panel SHOULD exist
  expect(rightCount).toBeGreaterThan(0);
});

test('VERIFY: 切到設計模式，右欄消失', async ({ page }) => {
  await page.goto(EXISTING_PROJECT_URL);
  await expect(page.locator('.workspace')).toBeVisible({ timeout: 10000 });

  // Find and click design tab
  const designBtn = page.locator('.mode-tabs button').filter({ hasText: '設計' });
  await expect(designBtn).toBeVisible({ timeout: 5000 });
  await designBtn.click();
  await page.waitForTimeout(600);

  const cls = await page.locator('.workspace').getAttribute('class');
  console.log('Design mode workspace class:', cls);

  const rightCount = await page.locator('.workspace__right').count();
  console.log('workspace__right DOM count in design mode:', rightCount);

  // Right panel must NOT be in DOM in design mode
  expect(rightCount).toBe(0);
});

test('VERIFY: 切到架構模式，右欄消失', async ({ page }) => {
  await page.goto(EXISTING_PROJECT_URL);
  await expect(page.locator('.workspace')).toBeVisible({ timeout: 10000 });

  const archBtn = page.locator('.mode-tabs button').filter({ hasText: '架構' });
  await archBtn.click();
  await page.waitForTimeout(600);

  const rightCount = await page.locator('.workspace__right').count();
  console.log('workspace__right count in architect mode:', rightCount);
  expect(rightCount).toBe(0);
});

test('VERIFY: 設計模式左欄有 chat-panel', async ({ page }) => {
  await page.goto(EXISTING_PROJECT_URL);
  await page.locator('.mode-tabs button').filter({ hasText: '設計' }).click();
  await page.waitForTimeout(600);

  const chatPanel = page.locator('[class*="chat-panel"]');
  await expect(chatPanel).toBeVisible({ timeout: 5000 });
  console.log('chat-panel found and visible ✓');
});

test('VERIFY: 顧問模式合議 toggle aria-checked=true（預設 ON）', async ({ page }) => {
  await page.goto(EXISTING_PROJECT_URL);
  // Ensure consult mode
  await page.locator('.mode-tabs button').filter({ hasText: '顧問' }).click().catch(() => {});
  await page.waitForTimeout(600);

  const toggle = page.locator('[role="switch"]').first();
  await expect(toggle).toBeVisible({ timeout: 5000 });
  const checked = await toggle.getAttribute('aria-checked');
  console.log('Council toggle aria-checked:', checked);
  expect(checked).toBe('true');
});
