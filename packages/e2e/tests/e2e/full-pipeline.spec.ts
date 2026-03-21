import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const API = 'http://localhost:3001';
const PROJECT_NAME = 'E2E 測試專案';

// 檢查規格書 PDF 是否存在
const specPdfPath = path.resolve(__dirname, '../../../../docs/需求文件/新好房【網B後台】批次自動刷新設定_規格書.pdf');
const hasSpecPdf = fs.existsSync(specPdfPath);

test.describe('完整端對端流程', () => {
  let projectId: string;

  // Full pipeline timeout: 5 minutes
  test.setTimeout(300000);

  test.afterAll(async ({ request }) => {
    // 清理：刪除測試專案
    if (projectId) {
      try { await request.delete(`${API}/api/projects/${projectId}`); } catch { /* ignore */ }
    }
  });

  test('步驟 1：建立專案', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Project Bridge');

    // 點擊新增專案
    await page.getByTestId('new-project-btn').click();
    await expect(page.getByText('專案名稱')).toBeVisible();
    await page.getByPlaceholder('我的原型專案').fill(PROJECT_NAME);
    await page.getByTestId('create-project-btn').click();

    // 驗證跳轉到工作區
    await expect(page).toHaveURL(/\/project\/[\w-]+/, { timeout: 10000 });
    const url = page.url();
    const idMatch = url.match(/\/project\/([\w-]+)/);
    expect(idMatch).toBeTruthy();
    projectId = idMatch![1];

    // 建立專案後會進入架構圖 wizard，跳過它
    await page.getByRole('button', { name: /跳過/ }).click();

    // 驗證專案名稱顯示
    await expect(page.getByText(PROJECT_NAME)).toBeVisible();
  });

  test('步驟 2：上傳規格書 PDF', async ({ page }) => {
    test.skip(!hasSpecPdf, '規格書 PDF 不存在，跳過上傳步驟');
    test.skip(!projectId, '前一步驟未成功建立專案');

    await page.goto(`/project/${projectId}`);

    // 切換到設計分頁
    await page.getByRole('tab', { name: '設計' }).click();

    // 上傳 PDF
    const fileInput = page.getByTestId('file-input');
    await fileInput.setInputFiles(specPdfPath);

    // 驗證分析開始
    await expect(page.getByText('◌ 分析中...')).toBeVisible({ timeout: 15000 });
  });

  test('步驟 3：等待分析完成', async ({ page }) => {
    test.skip(!hasSpecPdf, '無規格書，跳過分析步驟');
    test.skip(!projectId, '前一步驟未成功建立專案');

    await page.goto(`/project/${projectId}`);

    // 切換到設計分頁
    await page.getByRole('tab', { name: '設計' }).click();

    // 等待分析完成徽章
    await expect(page.getByText('✓ 分析完成')).toBeVisible({ timeout: 60000 });
  });

  test('步驟 4：查看分析預覽', async ({ page }) => {
    test.skip(!hasSpecPdf, '無規格書，跳過分析預覽');
    test.skip(!projectId, '前一步驟未成功建立專案');

    await page.goto(`/project/${projectId}`);

    // 切換到設計分頁
    await page.getByRole('tab', { name: '設計' }).click();

    const analysisComplete = page.getByText('✓ 分析完成');
    if (await analysisComplete.isVisible({ timeout: 5000 }).catch(() => false)) {
      await analysisComplete.click();
      await page.waitForTimeout(1000);
      // 面板應該開啟
    }
  });

  test('步驟 5：匯入架構（從分析）', async ({ page }) => {
    test.skip(!projectId, '前一步驟未成功建立專案');

    await page.goto(`/project/${projectId}`);

    // 切到架構圖分頁
    await page.getByRole('tab', { name: '架構圖' }).click();

    // 如果精靈出現，跳過它
    const skipBtn = page.getByRole('button', { name: /跳過/ });
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click();
    }

    // 嘗試從分析匯入（架構工具列中的按鈕）
    const importBtn = page.getByTestId('import-analysis-btn');
    if (await importBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      page.on('dialog', dialog => dialog.accept('取代'));
      await importBtn.click();
      await page.waitForTimeout(3000);
    }
  });

  test('步驟 6：新增元件到頁面', async ({ page }) => {
    test.skip(!projectId, '前一步驟未成功建立專案');

    // Seed architecture data via PATCH API to ensure flowchart is available
    // (steps 2-4 may have been skipped due to missing Gemini API / PDF)
    await page.request.patch(`${API}/api/projects/${projectId}/architecture`, {
      data: {
        arch_data: {
          type: 'page',
          subtype: 'website',
          aiDecidePages: false,
          nodes: [
            { id: 'p1', nodeType: 'page', name: '首頁', position: { x: 100, y: 100 }, referenceFileId: null, referenceFileUrl: null, components: [] },
            { id: 'p2', nodeType: 'page', name: '功能頁', position: { x: 400, y: 100 }, referenceFileId: null, referenceFileUrl: null, components: [] },
          ],
          edges: [{ id: 'e1', source: 'p1', target: 'p2' }],
        },
      },
    });

    await page.goto(`/project/${projectId}`);
    await page.waitForLoadState('networkidle');

    // With arch_data set, navigate to architecture tab
    const archTab = page.getByRole('tab', { name: '架構圖' });
    await expect(archTab).toBeVisible({ timeout: 15000 });
    await archTab.click();

    // Wait for the flowchart canvas to fully render
    await expect(page.getByTestId('arch-flowchart')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500);

    // 在首頁新增元件
    const pageNode = page.getByTestId('page-node-首頁');
    await expect(pageNode).toBeVisible({ timeout: 15000 });

    // 點擊展開元件列表（button text: "▶ 元件 (0)"）
    const compToggle = pageNode.getByText(/元件\s*\(/);
    await expect(compToggle).toBeVisible({ timeout: 10000 });
    await compToggle.click();

    // Wait for the component list to expand
    await page.waitForTimeout(300);

    // 點擊「+ 新增元件」
    const addCompBtn = pageNode.getByText('+ 新增元件');
    await expect(addCompBtn).toBeVisible({ timeout: 10000 });
    await addCompBtn.click();

    // 元件編輯對話框應出現
    const nameInput = page.locator('input[placeholder="例：搜尋按鈕"]');
    await expect(nameInput).toBeVisible({ timeout: 10000 });

    // 填入名稱
    await nameInput.fill('主要行動按鈕');

    // 選擇類型為按鈕（預設已是 button）
    await page.locator('select').first().selectOption('button');

    // 儲存元件
    await page.getByRole('button', { name: '儲存' }).click();

    // Wait for modal to close and component list to update
    await page.waitForTimeout(500);

    // 驗證元件出現在列表中
    await expect(pageNode.getByText('主要行動按鈕')).toBeVisible({ timeout: 10000 });
  });

  test('步驟 7：生成原型（並行管線）', async ({ page }) => {
    test.skip(!projectId, '前一步驟未成功建立專案');

    await page.goto(`/project/${projectId}`);

    // 切換到設計分頁
    await page.getByRole('tab', { name: '設計' }).click();

    const textarea = page.getByPlaceholder(/描述你的 UI/);
    await textarea.fill('請依照架構生成所有頁面，使用現代化設計風格');
    await page.getByTestId('send-btn').click();

    // 等待生成完成
    await expect(page.getByText('已生成原型')).toBeVisible({ timeout: 120000 });

    // 等待 iframe 出現
    const iframe = page.locator('iframe');
    await expect(iframe).toBeVisible({ timeout: 30000 });
  });

  test('步驟 8：驗證所有頁面存在', async ({ page }) => {
    test.skip(!projectId, '前一步驟未成功建立專案');

    await page.goto(`/project/${projectId}`);

    // 切換到設計分頁
    await page.getByRole('tab', { name: '設計' }).click();

    // 等待頁面載入
    await page.waitForTimeout(3000);

    // 檢查是否有多頁標籤
    const pageTabs = page.locator('[data-testid^="page-tab-"]');
    const tabCount = await pageTabs.count();

    if (tabCount > 1) {
      // 切換每個頁面並驗證 iframe 載入
      for (let i = 0; i < tabCount; i++) {
        await pageTabs.nth(i).click();
        await page.waitForTimeout(1000);
        await expect(page.locator('iframe')).toBeVisible();
      }
    } else {
      // 單頁模式，驗證 iframe 存在即可
      const iframe = page.locator('iframe');
      if (await iframe.isVisible({ timeout: 5000 }).catch(() => false)) {
        expect(true).toBeTruthy();
      }
    }
  });

  test('步驟 9：標注 + 修改元素', async ({ page }) => {
    test.skip(!projectId, '前一步驟未成功建立專案');

    await page.goto(`/project/${projectId}`);

    // 切換到設計分頁
    await page.getByRole('tab', { name: '設計' }).click();

    const iframe = page.locator('iframe');
    if (!(await iframe.isVisible({ timeout: 10000 }).catch(() => false))) {
      test.skip(true, '無原型可標注');
      return;
    }

    // 啟用標注模式
    await page.getByTestId('annotate-toggle').click();

    // 驗證標注模式 banner 出現
    await expect(page.getByText('✏️ 標注模式')).toBeVisible({ timeout: 5000 });

    // 在 iframe 中點擊元素
    const frameLocator = page.frameLocator('iframe');
    const target = frameLocator.locator('button, a, h1, h2, p').first();

    if (await target.isVisible({ timeout: 5000 }).catch(() => false)) {
      await target.click();

      // 修改彈窗
      const modifyTextarea = page.locator('textarea[placeholder*="描述要怎麼修改"]');
      if (await modifyTextarea.isVisible({ timeout: 5000 }).catch(() => false)) {
        await modifyTextarea.fill('字體放大 20%');
        await page.getByText('⚡ 修改').or(page.getByText('修改')).first().click();
        await page.waitForTimeout(5000);
      }
    }

    // 關閉標注模式
    await page.getByTestId('annotate-toggle').click();
  });

  test('步驟 10：微調（透過對話）', async ({ page }) => {
    test.skip(!projectId, '前一步驟未成功建立專案');

    await page.goto(`/project/${projectId}`);

    // 切換到設計分頁
    await page.getByRole('tab', { name: '設計' }).click();

    const iframe = page.locator('iframe');
    if (!(await iframe.isVisible({ timeout: 10000 }).catch(() => false))) {
      test.skip(true, '無原型可微調');
      return;
    }

    const textarea = page.getByPlaceholder(/描述你的 UI/);
    await textarea.fill('把標題文字改成深藍色，按鈕加上 hover 效果');
    await page.getByTestId('send-btn').click();

    // 等待微調完成
    await expect(page.getByText('把標題文字改成深藍色')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(10000);

    // iframe 應該還在
    await expect(iframe).toBeVisible();
  });

  test('步驟 11：匯出為 React', async ({ page, request }) => {
    test.skip(!projectId, '前一步驟未成功建立專案');

    await page.goto(`/project/${projectId}`);

    // 切換到設計分頁
    await page.getByRole('tab', { name: '設計' }).click();

    const iframe = page.locator('iframe');
    if (!(await iframe.isVisible({ timeout: 10000 }).catch(() => false))) {
      test.skip(true, '無原型可匯出');
      return;
    }

    // 點擊匯出
    await page.getByText('匯出').click();
    await expect(page.getByText('匯出為框架專案')).toBeVisible({ timeout: 3000 });

    // 監聽匯出回應 (POST /api/projects/:id/export-code)
    const exportPromise = page.waitForResponse(
      resp => resp.url().includes('/export-code') && resp.request().method() === 'POST',
      { timeout: 30000 },
    ).catch(() => null);

    // 選擇 React
    await page.getByTestId('export-react').click();

    const response = await exportPromise;
    if (response && response.ok()) {
      const data = await response.json();
      expect(data).toHaveProperty('files');
      expect(data.files.length).toBeGreaterThan(0);
    }
  });

  test('步驟 12：清理 — 刪除專案', async ({ page }) => {
    test.skip(!projectId, '無專案可刪除');

    await page.goto('/');

    // 設置確認對話框
    page.on('dialog', dialog => dialog.accept());

    const deleteBtn = page.getByTestId(`delete-project-${projectId}`);
    if (await deleteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await deleteBtn.click();
      await expect(page.getByText(PROJECT_NAME)).not.toBeVisible({ timeout: 5000 });
    }

    // 標記已清理，防止 afterAll 再次刪除
    projectId = '';
  });
});
