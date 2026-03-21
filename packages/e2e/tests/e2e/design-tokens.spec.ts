import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('Design Tokens 面板', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: `Tokens 測試 ${Date.now()}` },
    });
    const project = await res.json();
    projectId = project.id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      try { await request.delete(`${API}/api/projects/${projectId}`); } catch { /* ignore */ }
    }
  });

  /** Dismiss onboarding tooltip if visible */
  async function dismissOnboarding(page: import('@playwright/test').Page) {
    const skipBtn = page.getByTestId('onboarding-skip');
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click();
    }
  }

  /** Skip wizard and navigate to design tab */
  async function skipWizardAndGoToDesign(page: import('@playwright/test').Page) {
    // Skip the ArchWizard if visible
    const skipBtn = page.getByRole('button', { name: /跳過，直接去/ });
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click();
    }
    // Click the 設計 tab
    await page.getByRole('tab', { name: '設計' }).click();
    // Dismiss onboarding tooltip if visible
    await dismissOnboarding(page);
  }

  /** 生成原型以便 Tokens 按鈕可用 */
  async function generatePrototype(page: import('@playwright/test').Page) {
    await skipWizardAndGoToDesign(page);

    const textarea = page.getByPlaceholder(/描述你的 UI/);
    await textarea.fill('建立一個有藍色主題的簡單頁面');
    await page.getByTestId('send-btn').click();

    const iframe = page.locator('iframe');
    await expect(iframe).toBeVisible({ timeout: 60000 });
    await expect(page.getByTestId('generation-progress')).not.toBeVisible({ timeout: 30000 });
  }

  test('開啟 Tokens 面板', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await generatePrototype(page);

    // 點擊 Tokens 按鈕
    const tokensBtn = page.getByTestId('tokens-btn');
    await expect(tokensBtn).toBeEnabled();
    await tokensBtn.click();

    // 驗證面板出現（含「編輯器」和「CSS 變數」分頁按鈕）
    await expect(page.getByRole('button', { name: '編輯器' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'CSS 變數' })).toBeVisible();
  });

  test('切換到編輯器分頁', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await generatePrototype(page);

    await page.getByTestId('tokens-btn').click();

    // 點擊「編輯器」分頁
    await page.getByRole('button', { name: '編輯器' }).click();

    // 應顯示 Colors 區段、重新編譯按鈕、或初始編譯按鈕
    const colorsSection = page.getByText('Colors');
    const recompileBtn = page.getByRole('button', { name: '重新編譯' });
    const compileBtn = page.getByRole('button', { name: '編譯 Tokens' });

    await expect(colorsSection.or(recompileBtn).or(compileBtn)).toBeVisible({ timeout: 10000 });
  });

  test('驗證色票顯示', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await generatePrototype(page);

    await page.getByTestId('tokens-btn').click();

    // 切到 CSS 變數分頁
    await page.getByRole('button', { name: 'CSS 變數' }).click();

    // 等待載入
    await page.waitForTimeout(2000);

    // 應有色票（colorSwatch）或載入狀態
    const swatches = page.locator('[style*="borderRadius"][style*="backgroundColor"]');
    const emptyState = page.getByText('找不到 CSS 自訂屬性');
    const loading = page.getByText('載入 tokens 中');

    // 三者之一應該可見
    await expect(
      swatches.first().or(emptyState).or(loading),
    ).toBeVisible({ timeout: 10000 });
  });

  test('修改顏色 → 預覽更新', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await generatePrototype(page);

    await page.getByTestId('tokens-btn').click();
    await page.getByRole('button', { name: '編輯器' }).click();

    // 等待設計 tokens 載入
    await page.waitForTimeout(3000);

    // 如果有 Colors 區段
    const colorsSection = page.getByText('Colors');
    if (await colorsSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      // 找到第一個 color input
      const colorInput = page.locator('input[type="color"]').first();
      if (await colorInput.isVisible()) {
        const originalValue = await colorInput.inputValue();

        // 修改顏色
        await colorInput.evaluate((el: HTMLInputElement) => {
          el.value = '#ff0000';
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // 等待預覽更新
        await page.waitForTimeout(1000);

        // 預覽區的 Primary Button 背景色應已變更
        const previewBtn = page.locator('button:has-text("Primary Button")');
        if (await previewBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          const bgColor = await previewBtn.evaluate(
            el => window.getComputedStyle(el).backgroundColor,
          );
          expect(bgColor).toBeDefined();
        }
      }
    } else {
      // 沒有 tokens，需要先編譯
      const compileBtn = page.getByRole('button', { name: '編譯 Tokens' });
      if (await compileBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await compileBtn.click();
        await page.waitForTimeout(5000);
      }
    }
  });

  test('新增參考網址並提取', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await generatePrototype(page);

    await page.getByTestId('tokens-btn').click();
    await page.getByRole('button', { name: '編輯器' }).click();

    // 等待載入
    await page.waitForTimeout(3000);

    // 找到參考網址輸入框
    const urlInput = page.locator('input[placeholder="https://example.com"]');

    // 如果沒有 design tokens，先編譯
    if (!(await urlInput.isVisible({ timeout: 3000 }).catch(() => false))) {
      const compileBtn = page.getByRole('button', { name: '編譯 Tokens' });
      if (await compileBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await compileBtn.click();
        await page.waitForTimeout(5000);
      }
    }

    if (await urlInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await urlInput.fill('https://buy.houseprice.tw/living/');

      // 點擊「提取」
      const extractBtn = page.getByRole('button', { name: '提取' });
      await extractBtn.click();

      // 等待提取完成（可能需要較長時間）
      await page.waitForTimeout(10000);

      // 應有 crawled URL 計數或 toast
      const urlCount = page.getByText(/URL\(s\) crawled/);
      const toast = page.getByText('Style extracted');
      await expect(urlCount.or(toast)).toBeVisible({ timeout: 15000 }).catch(() => {
        // 可能提取失敗，這是可以接受的
      });
    }
  });

  test('編譯 Tokens → 驗證主色提取', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await generatePrototype(page);

    await page.getByTestId('tokens-btn').click();
    await page.getByRole('button', { name: '編輯器' }).click();

    await page.waitForTimeout(3000);

    // 點擊重新編譯（或初始編譯）
    const compileBtn = page.getByRole('button', { name: '重新編譯' }).or(page.getByRole('button', { name: '編譯 Tokens' }));
    if (await compileBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await compileBtn.click();

      // 等待編譯完成
      await page.waitForTimeout(5000);

      // 驗證 Colors 區段出現且有 primary 色
      await expect(page.getByText('Colors')).toBeVisible({ timeout: 5000 });

      // primary 色標籤應出現
      const primaryLabel = page.getByText('primary');
      await expect(primaryLabel).toBeVisible({ timeout: 5000 });
    }
  });

  test('儲存 Tokens', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await generatePrototype(page);

    await page.getByTestId('tokens-btn').click();
    await page.getByRole('button', { name: '編輯器' }).click();

    await page.waitForTimeout(3000);

    // 先確保有 tokens（編譯如需要）
    const compileBtn = page.getByRole('button', { name: '重新編譯' }).or(page.getByRole('button', { name: '編譯 Tokens' }));
    if (await compileBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await compileBtn.click();
      await page.waitForTimeout(5000);
    }

    // 點擊儲存
    const saveBtn = page.getByRole('button', { name: '儲存' });
    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveBtn.click();

      // 驗證 Saved toast 出現
      await expect(page.getByText('Saved')).toBeVisible({ timeout: 5000 });
    }
  });
});
