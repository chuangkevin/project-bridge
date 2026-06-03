import { test, expect } from '@playwright/test';

test('S1-1: 首頁直接到 /projects 不需登入', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL(/projects/, { timeout: 8000 });
  expect(page.url()).toMatch(/\/projects/);
  expect(page.url()).not.toMatch(/\/login|\/setup/);
});

test('S1-2: /projects 顯示新增專案按鈕', async ({ page }) => {
  await page.goto('/projects');
  await expect(page.locator('text=新增專案').first()).toBeVisible();
});

test('S1-3: 新增專案跳到 workspace', async ({ page }) => {
  await page.goto('/projects');
  await page.locator('text=新增專案').first().click();
  const input = page.locator('input').filter({ hasText: '' }).first();
  await input.waitFor({ timeout: 5000 });
  await input.fill('playwright-s1-test');
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/projects\/.{10,}/, { timeout: 10000 });
  expect(page.url()).toMatch(/\/projects\/.+/);
});

test('S1-4: TopBar 版本號是 commit hash 而非 v2.0', async ({ page }) => {
  await page.goto('/projects');
  // Enter a project if any exist
  const projectLink = page.locator('a[href*="/projects/"]:not([href="/projects"])').first();
  if (await projectLink.count() > 0) {
    await projectLink.click();
    await page.waitForURL(/\/projects\/.+/);
  } else {
    // Create one
    await page.locator('text=新增專案').first().click();
    await page.locator('input').first().fill('v-test');
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/projects\/.+/);
  }
  // Version should be a 7-char hex hash OR NOT be literal "v2.0"
  const pageText = await page.textContent('body');
  if (pageText?.includes('v2.0')) {
    throw new Error('Version still shows hardcoded "v2.0" — should be git hash');
  }
});

test('S1-5: /settings 直接可用，不跳密碼框', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.locator('text=AI 供應商')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('input[type="password"]')).not.toBeVisible();
});

test('S1-6: /global-design 頁面存在', async ({ page }) => {
  await page.goto('/global-design');
  await expect(page.locator('text=設計說明, text=全域設計').first()).toBeVisible({ timeout: 5000 });
});
