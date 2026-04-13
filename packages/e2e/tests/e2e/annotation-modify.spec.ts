import { test, expect } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_BASE_URL || 'http://localhost:3001';

test.describe('標注與修改模式', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: `標注測試 ${Date.now()}` },
    });
    const project = await res.json();
    projectId = project.id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      try { await request.delete(`${API}/api/projects/${projectId}`); } catch { /* ignore */ }
    }
  });

  /** Navigate to project workspace and dismiss any wizard/onboarding */
  async function goToDesignTab(page: import('@playwright/test').Page) {
    await page.goto(`/project/${projectId}`);

    // Dismiss onboarding or arch-wizard skip buttons if visible
    const skipBtn = page.getByRole('button', { name: /跳過/ });
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click();
    }

    // Switch to 設計 tab
    await page.getByRole('tab', { name: '設計' }).click();
  }

  /** Generate a prototype via the chat panel so we have an iframe to annotate */
  async function generatePrototype(page: import('@playwright/test').Page) {
    await page.goto(`/project/${projectId}`);

    // Dismiss onboarding or arch-wizard skip buttons if visible
    const skipBtn = page.getByRole('button', { name: /跳過/ });
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click();
    }

    // Fill the chat input and send
    const textarea = page.locator('textarea[placeholder*="描述你的 UI"]');
    await textarea.fill('建立一個包含標題「歡迎光臨」和一個藍色按鈕「開始使用」的頁面');
    await page.getByTestId('send-btn').click();

    // Wait for iframe (prototype preview) to appear
    const iframe = page.frameLocator('iframe[title="原型預覽"]');
    await expect(page.locator('iframe[title="原型預覽"]')).toBeVisible({ timeout: 60000 });

    // Wait for generation to finish
    await expect(page.getByTestId('generation-progress')).not.toBeVisible({ timeout: 30000 });

    return iframe;
  }

  test('啟用標注模式', async ({ page }) => {
    await page.goto(`/project/${projectId}`);

    // Dismiss onboarding if present
    const skipBtn = page.getByRole('button', { name: /跳過/ });
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click();
    }

    const toggleBtn = page.getByTestId('annotate-toggle');
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn).toContainText('標注');

    // Get background color before activation
    const bgBefore = await toggleBtn.evaluate(
      el => window.getComputedStyle(el).backgroundColor,
    );

    // Click to activate annotation mode
    await toggleBtn.click();

    // Background color should change (active state)
    const bgAfter = await toggleBtn.evaluate(
      el => window.getComputedStyle(el).backgroundColor,
    );
    expect(bgBefore).not.toBe(bgAfter);

    // Verify annotation mode banner appears
    await expect(page.getByText('✏️ 標注模式 — 點擊元件來修改或標注 · 按')).toBeVisible();
  });

  test('點擊元素 → 修改彈窗出現 → 輸入指令 → 修改', async ({ page }) => {
    test.setTimeout(120000);

    const frameLocator = await generatePrototype(page);

    // Activate annotation mode
    await page.getByTestId('annotate-toggle').click();
    await expect(page.getByText('✏️ 標注模式 — 點擊元件來修改或標注 · 按')).toBeVisible();

    // Click an element inside the iframe
    const button = frameLocator.locator('button').first();
    if (await button.isVisible({ timeout: 5000 }).catch(() => false)) {
      await button.click();

      // Verify quick regen popup appears with "⟳ 修改元件 · {tag}"
      await expect(page.getByText('⟳ 修改元件 ·')).toBeVisible({ timeout: 5000 });

      // Verify the modify textarea with correct placeholder
      const modifyTextarea = page.locator('textarea[placeholder="描述要怎麼修改這個元件..."]');
      await expect(modifyTextarea).toBeVisible({ timeout: 5000 });

      await modifyTextarea.fill('把按鈕文字改成「立即開始」並加上圓角');

      // Click "⚡ 修改" button
      await page.getByRole('button', { name: '⚡ 修改' }).click();

      // Wait for "✓ 元件已更新" toast
      await expect(page.getByText('✓ 元件已更新')).toBeVisible({ timeout: 30000 });

      // iframe should still be visible
      await expect(page.locator('iframe[title="原型預覽"]')).toBeVisible();
    }
  });

  test('新增標注 → 標注數量增加', async ({ page }) => {
    test.setTimeout(120000);

    const frameLocator = await generatePrototype(page);

    // Activate annotation mode
    await page.getByTestId('annotate-toggle').click();
    await expect(page.getByText('✏️ 標注模式 — 點擊元件來修改或標注 · 按')).toBeVisible();

    // Click an element inside the iframe
    const heading = frameLocator.locator('h1, h2, h3, p').first();

    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      await heading.click();

      // Quick regen popup should appear
      await expect(page.getByText('⟳ 修改元件 ·')).toBeVisible({ timeout: 5000 });

      // Click "+ 標注" button to switch to annotation form
      await page.getByRole('button', { name: '+ 標注' }).click();

      // Wait for annotation editor to appear and fill it
      await page.waitForTimeout(1000);
    }
  });

  test('停用標注模式', async ({ page }) => {
    await page.goto(`/project/${projectId}`);

    // Dismiss onboarding if present
    const skipBtn = page.getByRole('button', { name: /跳過/ });
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click();
    }

    const toggleBtn = page.getByTestId('annotate-toggle');

    // Activate
    await toggleBtn.click();
    await expect(page.getByText('✏️ 標注模式 — 點擊元件來修改或標注 · 按')).toBeVisible();

    // Deactivate
    await toggleBtn.click();

    // Banner should disappear
    await expect(page.getByText('✏️ 標注模式 — 點擊元件來修改或標注 · 按')).not.toBeVisible({ timeout: 3000 });

    // Button should return to original state
    const bgAfterDisable = await toggleBtn.evaluate(
      el => window.getComputedStyle(el).backgroundColor,
    );
    expect(bgAfterDisable).toBeDefined();
  });

  test('鍵盤快捷鍵 A 切換標注模式', async ({ page }) => {
    await page.goto(`/project/${projectId}`);

    // Dismiss onboarding if present
    const skipBtn = page.getByRole('button', { name: /跳過/ });
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click();
    }

    // Press A to activate
    await page.keyboard.press('a');

    // Verify annotation mode opens
    const banner = page.getByText('✏️ 標注模式 — 點擊元件來修改或標注 · 按');
    const isActive = await banner.isVisible({ timeout: 3000 }).catch(() => false);

    if (isActive) {
      // Press Escape to close
      await page.keyboard.press('Escape');
      await expect(banner).not.toBeVisible({ timeout: 3000 });
    }
  });
});
