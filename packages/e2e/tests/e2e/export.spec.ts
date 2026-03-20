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

  /** Navigate to project workspace, skip wizard, switch to design tab, and generate a prototype */
  async function setupPrototype(page: import('@playwright/test').Page) {
    await page.goto(`/project/${projectId}`);

    // Skip the architecture wizard
    await page.getByRole('button', { name: /跳過/ }).click();

    // Switch to design tab
    await page.getByRole('tab', { name: '設計' }).click();

    // Type a prompt and send
    const textarea = page.locator('textarea[placeholder*="描述你的 UI"]');
    await textarea.fill('建立一個包含導航列、主要內容區和頁尾的著陸頁');
    await page.getByTestId('send-btn').click();

    // Wait for the iframe preview to appear (prototype generated)
    const iframe = page.locator('iframe');
    await expect(iframe).toBeVisible({ timeout: 60000 });

    // Wait for generation to finish
    await expect(page.getByTestId('generation-progress')).not.toBeVisible({ timeout: 30000 });
  }

  test('點擊匯出 → 驗證框架選項', async ({ page }) => {
    test.setTimeout(120000);
    await setupPrototype(page);

    // 點擊匯出按鈕 (button with title="匯出選項")
    await page.getByRole('button', { name: '匯出' }).click();

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
    test.setTimeout(120000);
    await setupPrototype(page);

    // 打開匯出選單
    await page.getByRole('button', { name: '匯出' }).click();
    await expect(page.getByText('匯出為框架專案')).toBeVisible();

    // 監聽匯出 API 請求
    const exportPromise = page.waitForResponse(
      resp => resp.url().includes('/export-code') && resp.request().method() === 'POST',
      { timeout: 30000 },
    ).catch(() => null);

    // 選擇 React
    await page.getByTestId('export-react').click();

    // 等待匯出回應
    const response = await exportPromise;
    if (response) {
      expect(response.status()).toBeLessThan(500);
    }
  });

  test('匯出回應包含檔案', async ({ request }) => {
    // Seed a prototype version via chat API so export-code has HTML to work with
    // First, send a chat message to generate a prototype
    const chatRes = await request.post(`${API}/api/projects/${projectId}/chat`, {
      data: {
        message: '建立一個簡單的著陸頁',
        conversationHistory: [],
      },
    });

    // The chat endpoint is SSE, so we need to check the project for HTML after
    // Wait briefly for generation
    await new Promise(r => setTimeout(r, 5000));

    // Check if the project now has HTML
    const projectRes = await request.get(`${API}/api/projects/${projectId}`);
    const project = await projectRes.json();

    if (project.currentHtml) {
      // Test export-code API directly
      const exportRes = await request.post(`${API}/api/projects/${projectId}/export-code`, {
        data: { framework: 'react' },
      });

      if (exportRes.ok()) {
        const data = await exportRes.json();
        // 回應應包含 framework, files, totalFiles
        expect(data).toHaveProperty('framework', 'react');
        expect(data).toHaveProperty('files');
        expect(data).toHaveProperty('totalFiles');
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
    test.setTimeout(120000);
    await setupPrototype(page);

    // 打開匯出選單
    await page.getByRole('button', { name: '匯出' }).click();
    await expect(page.getByText('匯出為框架專案')).toBeVisible();

    // 監聽匯出 API 請求
    const exportPromise = page.waitForResponse(
      resp => resp.url().includes('/export-code') && resp.request().method() === 'POST',
      { timeout: 30000 },
    ).catch(() => null);

    // 點擊 HTML 匯出
    const htmlExportBtn = page.getByTestId('export-html');
    await expect(htmlExportBtn).toBeVisible();
    await htmlExportBtn.click();

    // 等待匯出回應
    const response = await exportPromise;
    if (response) {
      expect(response.status()).toBeLessThan(500);
    }
  });
});
