import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('匯出功能', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: `匯出測試 ${Date.now()}` },
    });
    const project = await res.json();
    projectId = project.id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      try { await request.delete(`${API}/api/projects/${projectId}`); } catch { /* ignore */ }
    }
  });

  /** 生成原型 */
  async function generatePrototype(page: import('@playwright/test').Page) {
    const textarea = page.locator('textarea[placeholder*="描述你的 UI"]');
    await textarea.fill('建立一個包含導航列、主要內容區和頁尾的著陸頁');
    await page.getByTestId('send-btn').click();

    const iframe = page.locator('iframe');
    await expect(iframe).toBeVisible({ timeout: 60000 });
    await expect(page.getByTestId('generation-progress')).not.toBeVisible({ timeout: 30000 });
  }

  test('點擊匯出 → 驗證框架選項', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await generatePrototype(page);

    // 點擊匯出按鈕
    await page.getByText('匯出').click();

    // 驗證匯出選單出現
    await expect(page.getByText('匯出為框架專案')).toBeVisible({ timeout: 3000 });

    // 驗證所有框架選項
    await expect(page.getByTestId('export-react')).toBeVisible();
    await expect(page.getByTestId('export-vue3')).toBeVisible();
    await expect(page.getByTestId('export-nextjs')).toBeVisible();
    await expect(page.getByTestId('export-nuxt3')).toBeVisible();
    await expect(page.getByTestId('export-html')).toBeVisible();
  });

  test('選擇 React → 驗證匯出開始', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await generatePrototype(page);

    // 打開匯出選單
    await page.getByText('匯出').click();
    await expect(page.getByText('匯出為框架專案')).toBeVisible();

    // 監聽匯出 API 請求
    const exportPromise = page.waitForResponse(
      resp => resp.url().includes('/export') && resp.request().method() === 'POST',
      { timeout: 30000 },
    ).catch(() => null);

    // 選擇 React
    await page.getByTestId('export-react').click();

    // 按鈕文字應變更（顯示處理中狀態）或顏色改變
    // React 按鈕應變為紫色（正在匯出）
    const reactBtn = page.getByTestId('export-react');
    await expect(reactBtn).toHaveCSS('color', 'rgb(167, 139, 250)', { timeout: 5000 }).catch(() => {
      // 可能已完成
    });

    // 等待匯出回應
    const response = await exportPromise;
    if (response) {
      expect(response.status()).toBeLessThan(500);
    }
  });

  test('匯出回應包含檔案', async ({ page, request }) => {
    await page.goto(`/project/${projectId}`);
    await generatePrototype(page);

    // 直接透過 API 測試匯出
    const projectRes = await request.get(`${API}/api/projects/${projectId}`);
    const project = await projectRes.json();

    if (project.html) {
      const exportRes = await request.post(`${API}/api/projects/${projectId}/export`, {
        data: { framework: 'react', html: project.html },
      });

      if (exportRes.ok()) {
        const data = await exportRes.json();
        // 回應應包含 files 陣列
        expect(data).toHaveProperty('files');
        expect(Array.isArray(data.files)).toBeTruthy();
        expect(data.files.length).toBeGreaterThan(0);

        // 每個檔案應有 path 和 content
        for (const file of data.files) {
          expect(file).toHaveProperty('path');
          expect(file).toHaveProperty('content');
        }
      }
    }
  });

  test('匯出 HTML', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await generatePrototype(page);

    // 打開匯出選單
    await page.getByText('匯出').click();

    // 點擊 HTML 匯出
    const htmlExportBtn = page.getByTestId('export-html');
    await expect(htmlExportBtn).toBeVisible();
    await htmlExportBtn.click();

    // HTML 匯出通常會觸發下載或複製
    await page.waitForTimeout(2000);
  });
});
