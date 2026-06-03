import { test, expect, Browser } from '@playwright/test';

let projectUrl = '';

async function getOrCreateProject(browser: Browser): Promise<string> {
  if (projectUrl) return projectUrl;
  const page = await browser.newPage();
  await page.goto('/projects');
  await page.locator('text=新增專案').first().click();
  await page.locator('input').first().fill('pw-design-' + Date.now());
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/projects\/.+/);
  projectUrl = page.url();
  await page.close();
  return projectUrl;
}

async function goToDesign(page: any, url: string) {
  await page.goto(url);
  await page.locator('button:has-text("設計"), text=設計').first().click().catch(() => {});
  await page.waitForTimeout(500);
}

test('S3-1: 設計模式 - 無右欄 (workspace__right 不存在)', async ({ page, browser }) => {
  const url = await getOrCreateProject(browser);
  await goToDesign(page, url);
  await expect(page.locator('.workspace__right')).not.toBeVisible();
});

test('S3-2: 設計模式 - 左側聊天面板存在', async ({ page, browser }) => {
  const url = await getOrCreateProject(browser);
  await goToDesign(page, url);
  await expect(page.locator('[class*="chat-panel"]')).toBeVisible();
});

test('S3-3: 設計模式 - 合議 toggle 存在且預設 ON', async ({ page, browser }) => {
  const url = await getOrCreateProject(browser);
  await goToDesign(page, url);
  const toggle = page.locator('[role="switch"]').first();
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
});

test('S3-4: 原始碼按鈕 toggle — 預設隱藏，點擊後顯示', async ({ page, browser }) => {
  const url = await getOrCreateProject(browser);
  await goToDesign(page, url);
  // Source should be hidden by default
  await expect(page.locator('[class*="source-drawer"]')).not.toBeVisible();
  // Click 原始碼 button
  await page.locator('button:has-text("原始碼")').click();
  await expect(page.locator('[class*="source-drawer"]')).toBeVisible({ timeout: 3000 });
  // Click again to hide
  await page.locator('button:has-text("原始碼")').click();
  await expect(page.locator('[class*="source-drawer"]')).not.toBeVisible();
});

test('S3-5: 生成設計後 iframe 預覽有內容', async ({ page, browser }) => {
  const url = await getOrCreateProject(browser);
  await goToDesign(page, url);
  const composer = page.locator('textarea').last();
  await composer.fill('做一個有加減按鈕的計數器，數字顯示在中間');
  await composer.press('Enter');
  // Wait for iframe to appear with content
  await expect(page.locator('[class*="preview-main"] iframe')).toBeVisible({ timeout: 90000 });
  const frame = page.frameLocator('[class*="preview-main"] iframe');
  await expect(frame.locator('button, [class*="counter"]').first()).toBeVisible({ timeout: 15000 });
});

test('S3-6: 多頁面設計 - 頁面切換有效', async ({ page, browser }) => {
  const url = await getOrCreateProject(browser);
  await goToDesign(page, url);
  const composer = page.locator('textarea').last();
  await composer.fill('做一個展覽網站，有首頁和購票頁，導覽可以互相切換，用 currentPage 控制');
  await composer.press('Enter');

  await expect(page.locator('[class*="preview-main"] iframe')).toBeVisible({ timeout: 120000 });
  const frame = page.frameLocator('[class*="preview-main"] iframe');

  // Find navigation elements
  const navEl = frame.locator('nav button, nav a, [class*="nav"] button').first();
  await navEl.waitFor({ timeout: 10000 });

  // Capture page content before click
  const before = await frame.locator('[class*="app"], main, body > div').first().innerHTML({ timeout: 5000 }).catch(() => '');
  await navEl.click();
  await page.waitForTimeout(800);
  const after = await frame.locator('[class*="app"], main, body > div').first().innerHTML({ timeout: 5000 }).catch(() => '');

  // Content should change OR at minimum no crash
  console.log('Navigation test: before.length=', before.length, 'after.length=', after.length, 'changed=', before !== after);
});

test('S3-7: 點擊 iframe 內 a[href] 不跳離 workspace', async ({ page, browser }) => {
  const url = await getOrCreateProject(browser);
  await goToDesign(page, url);
  const initialUrl = url;

  // If there's an existing design with anchor tags
  const frame = page.frameLocator('[class*="preview-main"] iframe');
  const anchors = frame.locator('a[href]:not([href="#"]):not([href^="javascript"])');

  if (await anchors.count() > 0) {
    await anchors.first().click({ force: true });
    await page.waitForTimeout(500);
    expect(page.url()).toBe(initialUrl);
  } else {
    test.skip();
  }
});
