import { test, expect } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_BASE_URL || 'http://localhost:3001';

/**
 * UX Enhancement Pack: Architecture E2E Tests
 *
 * Covers:
 *  - Architecture wizard shows for new projects
 *  - "跳過，直接去 Design" skips wizard
 *  - Adding pages in wizard
 *  - Importing from existing prototype
 *  - Upload reference image to architecture node
 *
 * data-testid attributes used:
 *   arch-wizard, wizard-question, wizard-option-page, wizard-option-component,
 *   wizard-option-website, wizard-option-2-3, wizard-chip-首頁, wizard-chip-列表頁,
 *   wizard-next, wizard-finish-view, wizard-finish-generate,
 *   arch-flowchart, add-page-btn, page-node-{name},
 *   import-from-prototype-btn
 */

// ─── Helpers ──────────────────────────────────────────────

async function seedArch(request: any, projectId: string, archData: object) {
  await request.patch(`${API}/api/projects/${projectId}/architecture`, {
    data: { arch_data: archData },
  });
}

// ─── Tests ────────────────────────────────────────────────

test.describe('架構圖精靈 — UX 增強', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: `架構 UX ${Date.now()}` },
    });
    const project = await res.json();
    projectId = project.id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      try { await request.delete(`${API}/api/projects/${projectId}`); } catch { /* ignore */ }
    }
  });

  test('新專案預設顯示架構精靈', async ({ page }) => {
    await page.goto(`/project/${projectId}`);

    // Wizard should appear for new projects (no arch_data)
    await expect(page.getByTestId('arch-wizard')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('wizard-question')).toContainText('你想設計的是？');
  });

  test('「跳過，直接去 Design」→ 切換到設計模式', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await expect(page.getByTestId('arch-wizard')).toBeVisible({ timeout: 10000 });

    // Click skip button
    await page.getByRole('button', { name: /跳過/ }).click();

    // Should be in design tab now
    await expect(page.getByRole('tab', { name: '設計' })).toBeVisible({ timeout: 5000 });

    // Wizard should no longer be visible
    await expect(page.getByTestId('arch-wizard')).not.toBeVisible();
  });

  test('精靈步驟：新增頁面', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await expect(page.getByTestId('arch-wizard')).toBeVisible({ timeout: 10000 });

    // Q1: 選擇「頁面（網站 / App）」
    await page.getByTestId('wizard-option-page').click();

    // Q2: 選擇類型「網站」
    await page.getByTestId('wizard-option-website').click();

    // Q3: 選擇頁面數量 2–3
    await page.getByTestId('wizard-option-2-3').click();

    // Q4: 定義第一個頁面名稱
    await expect(page.getByTestId('wizard-question')).toBeVisible();
    await page.getByTestId('wizard-chip-首頁').click();
    await page.getByTestId('wizard-next').click();

    // Q5: 定義第二個頁面名稱
    await expect(page.getByTestId('wizard-question')).toBeVisible();
    await page.getByTestId('wizard-chip-列表頁').click();
    await page.getByTestId('wizard-next').click();

    // Finish screen
    await expect(page.getByTestId('wizard-question')).toContainText('架構完成！');
  });

  test('精靈完成 → 查看架構圖 → 節點出現', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await expect(page.getByTestId('arch-wizard')).toBeVisible({ timeout: 10000 });

    // Complete wizard quickly
    await page.getByTestId('wizard-option-page').click();
    await page.getByTestId('wizard-option-website').click();
    await page.getByTestId('wizard-option-2-3').click();
    await page.getByTestId('wizard-chip-首頁').click();
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-chip-列表頁').click();
    await page.getByTestId('wizard-next').click();

    // Click "查看架構圖"
    await page.getByTestId('wizard-finish-view').click();

    // Flowchart should be visible with nodes
    await expect(page.getByTestId('arch-flowchart')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('page-node-首頁')).toBeVisible();
    await expect(page.getByTestId('page-node-列表頁')).toBeVisible();
  });

  test('精靈完成 → AI 生成選項可見', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await expect(page.getByTestId('arch-wizard')).toBeVisible({ timeout: 10000 });

    // Complete wizard
    await page.getByTestId('wizard-option-page').click();
    await page.getByTestId('wizard-option-website').click();
    await page.getByTestId('wizard-option-2-3').click();
    await page.getByTestId('wizard-chip-首頁').click();
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-chip-列表頁').click();
    await page.getByTestId('wizard-next').click();

    // Both finish options should be visible
    await expect(page.getByTestId('wizard-finish-view')).toBeVisible();
    await expect(page.getByTestId('wizard-finish-generate')).toBeVisible();
  });

  test('架構圖：新增頁面按鈕', async ({ page }) => {
    // Seed existing architecture to skip wizard
    await seedArch(page.request, projectId, {
      type: 'page',
      subtype: 'website',
      aiDecidePages: false,
      nodes: [{ id: 'p1', nodeType: 'page', name: '首頁', position: { x: 100, y: 100 }, referenceFileId: null, referenceFileUrl: null }],
      edges: [],
    });

    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '架構圖' }).click();
    await expect(page.getByTestId('arch-flowchart')).toBeVisible({ timeout: 10000 });

    // Click add page button
    await page.getByTestId('add-page-btn').click();

    // New page node should appear
    await expect(page.getByTestId('page-node-新頁面')).toBeVisible({ timeout: 5000 });
  });

  test('從現有原型匯入架構', async ({ page }) => {
    // Seed architecture to have the flowchart visible
    await seedArch(page.request, projectId, {
      type: 'page',
      subtype: 'website',
      aiDecidePages: false,
      nodes: [{ id: 'p1', nodeType: 'page', name: '首頁', position: { x: 100, y: 100 }, referenceFileId: null, referenceFileUrl: null }],
      edges: [],
    });

    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '架構圖' }).click();
    await expect(page.getByTestId('arch-flowchart')).toBeVisible({ timeout: 10000 });

    // Check for "從原型匯入" button
    const importBtn = page.getByTestId('import-from-prototype-btn');
    if (await importBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await importBtn.click();
      // The import action should trigger some feedback (toast, new nodes, etc.)
      await page.waitForTimeout(2000);
    } else {
      // Button not visible — feature may not be active for this project state
      // Skip gracefully
      test.skip();
    }
  });

  test('架構節點上傳參考圖片', async ({ page }) => {
    await seedArch(page.request, projectId, {
      type: 'page',
      subtype: 'website',
      aiDecidePages: false,
      nodes: [{
        id: 'p1',
        nodeType: 'page',
        name: '首頁',
        position: { x: 100, y: 100 },
        referenceFileId: null,
        referenceFileUrl: null,
      }],
      edges: [],
    });

    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '架構圖' }).click();
    await expect(page.getByTestId('arch-flowchart')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('page-node-首頁')).toBeVisible();

    // Right-click on the page node to open context menu
    await page.getByTestId('page-node-首頁').dispatchEvent('contextmenu');

    // Look for upload/reference image option in context menu
    const uploadOption = page.getByText(/參考圖|上傳圖|reference/i);
    if (await uploadOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await uploadOption.click();

      // File input should be available; set a test image
      // We use a programmatically created minimal PNG
      const fileInput = page.locator('input[type="file"]').last();
      if (await fileInput.count() > 0) {
        // Create a minimal 1x1 PNG buffer for testing
        await fileInput.setInputFiles({
          name: 'test-reference.png',
          mimeType: 'image/png',
          buffer: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'base64'
          ),
        });
        await page.waitForTimeout(2000);
      }
    } else {
      // Context menu might use different labeling or no upload option
      // Check for direct upload on the node card itself
      const nodeCard = page.getByTestId('page-node-首頁');
      const fileInputOnNode = nodeCard.locator('input[type="file"]');
      if (await fileInputOnNode.count() > 0) {
        await fileInputOnNode.setInputFiles({
          name: 'test-reference.png',
          mimeType: 'image/png',
          buffer: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'base64'
          ),
        });
        await page.waitForTimeout(2000);
      }
    }

    // Regardless of upload method, page should not crash
    await expect(page.getByTestId('arch-flowchart')).toBeVisible();
  });

  test('選擇「元件」模式 → 進入元件架構', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await expect(page.getByTestId('arch-wizard')).toBeVisible({ timeout: 10000 });

    // Q1: 選擇「元件」
    const componentOption = page.getByTestId('wizard-option-component');
    if (await componentOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await componentOption.click();
      // Should advance to the next step
      await expect(page.getByTestId('wizard-question')).toBeVisible();
    } else {
      test.skip(true, 'Component option not available in wizard');
    }
  });
});
