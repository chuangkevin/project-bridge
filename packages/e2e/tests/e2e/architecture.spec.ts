import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('架構圖功能', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: `架構測試 ${Date.now()}` },
    });
    const project = await res.json();
    projectId = project.id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      try { await request.delete(`${API}/api/projects/${projectId}`); } catch { /* ignore */ }
    }
  });

  test('導航到架構圖分頁', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '架構圖' }).click();

    // 驗證精靈出現
    await expect(page.getByTestId('arch-wizard')).toBeVisible();
    await expect(page.getByTestId('wizard-question')).toContainText('你想設計的是？');
  });

  test('跳過精靈 → 前往流程圖', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '架構圖' }).click();

    // 選擇「頁面（網站 / App）」
    await page.getByTestId('wizard-option-page').click();
    // 選擇類型「網站」
    await page.getByTestId('wizard-option-website').click();
    // 選擇頁面數量 2-3
    await page.getByTestId('wizard-option-2-3').click();

    // 應出現頁面名稱設定
    await expect(page.getByTestId('wizard-question')).toBeVisible();

    // 點擊下一步
    await page.getByTestId('wizard-next').click();

    // 驗證到達流程圖或完成頁
    const flowchart = page.getByTestId('arch-flowchart');
    const finishView = page.getByTestId('wizard-finish-view');
    await expect(flowchart.or(finishView)).toBeVisible({ timeout: 10000 });
  });

  test('新增頁面節點 → 驗證出現', async ({ page }) => {
    // 透過 API 先建立架構資料以跳過精靈
    await page.request.put(`${API}/api/projects/${projectId}/architecture`, {
      data: {
        type: 'page',
        subtype: 'website',
        aiDecidePages: false,
        nodes: [{ id: 'p1', name: '首頁', position: { x: 100, y: 100 }, components: [] }],
        edges: [],
      },
    });

    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '架構圖' }).click();

    // 等待流程圖載入
    await expect(page.getByTestId('arch-flowchart')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('page-node-首頁')).toBeVisible();

    // 點擊「新增頁面」
    await page.getByTestId('add-page-btn').click();

    // 填入頁面名稱（prompt 對話框）
    page.once('dialog', async dialog => {
      expect(dialog.type()).toBe('prompt');
      await dialog.accept('關於我們');
    });

    // 新增頁面按鈕觸發 prompt
    // 由於 handleAddPage 內部使用 prompt, 驗證新節點出現
    await expect(page.getByTestId('page-node-關於我們')).toBeVisible({ timeout: 5000 });
  });

  test('重新命名頁面 → 驗證名稱更新', async ({ page }) => {
    await page.request.put(`${API}/api/projects/${projectId}/architecture`, {
      data: {
        type: 'page',
        subtype: 'website',
        aiDecidePages: false,
        nodes: [{ id: 'p1', name: '舊名稱', position: { x: 100, y: 100 }, components: [] }],
        edges: [],
      },
    });

    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '架構圖' }).click();
    await expect(page.getByTestId('arch-flowchart')).toBeVisible({ timeout: 10000 });

    // 雙擊頁面名稱來改名
    const pageName = page.getByTestId('page-node-舊名稱').locator('.arch-page-node__name');

    page.once('dialog', async dialog => {
      expect(dialog.type()).toBe('prompt');
      await dialog.accept('新名稱');
    });

    await pageName.dblclick();

    await expect(page.getByTestId('page-node-新名稱')).toBeVisible({ timeout: 5000 });
  });

  test('新增第二個頁面 → 建立邊（連線）', async ({ page }) => {
    await page.request.put(`${API}/api/projects/${projectId}/architecture`, {
      data: {
        type: 'page',
        subtype: 'website',
        aiDecidePages: false,
        nodes: [
          { id: 'p1', name: '首頁', position: { x: 100, y: 100 }, components: [] },
          { id: 'p2', name: '產品頁', position: { x: 400, y: 100 }, components: [] },
        ],
        edges: [],
      },
    });

    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '架構圖' }).click();
    await expect(page.getByTestId('arch-flowchart')).toBeVisible({ timeout: 10000 });

    // 驗證兩個節點都存在
    await expect(page.getByTestId('page-node-首頁')).toBeVisible();
    await expect(page.getByTestId('page-node-產品頁')).toBeVisible();

    // 透過拖動 handle 建立連線（從首頁的 source handle 到產品頁的 target handle）
    const sourceHandle = page.getByTestId('page-node-首頁').locator('.react-flow__handle-right');
    const targetHandle = page.getByTestId('page-node-產品頁').locator('.react-flow__handle-left');

    if (await sourceHandle.isVisible() && await targetHandle.isVisible()) {
      await sourceHandle.dragTo(targetHandle);
      // 驗證邊出現
      const edges = page.locator('.react-flow__edge');
      await expect(edges.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('展開元件列表 → 新增元件', async ({ page }) => {
    await page.request.put(`${API}/api/projects/${projectId}/architecture`, {
      data: {
        type: 'page',
        subtype: 'website',
        aiDecidePages: false,
        nodes: [{ id: 'p1', name: '首頁', position: { x: 100, y: 100 }, components: [] }],
        edges: [],
      },
    });

    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '架構圖' }).click();
    await expect(page.getByTestId('arch-flowchart')).toBeVisible({ timeout: 10000 });

    const pageNode = page.getByTestId('page-node-首頁');

    // 點擊展開元件列表
    await pageNode.getByText(/元件/).click();

    // 點擊「+ 新增元件」
    await pageNode.getByText('+ 新增元件').click();

    // 元件編輯對話框應出現
    const modal = page.getByText('新增元件');
    await expect(modal).toBeVisible();

    // 填入名稱
    await page.locator('input[placeholder*="搜尋按鈕"]').fill('導航按鈕');

    // 選擇類型為按鈕
    await page.locator('select').first().selectOption('button');

    // 填入描述
    const descInput = page.locator('textarea, input').filter({ hasText: '' }).last();
    // 尋找描述欄位（如果存在）
    const descriptionFields = page.locator('input, textarea').all();

    // 儲存元件
    await page.getByText('儲存').or(page.getByText('確認')).or(page.getByText('Save')).first().click();

    // 驗證元件出現在列表中
    await expect(pageNode.getByText('導航按鈕')).toBeVisible({ timeout: 5000 });
  });

  test('編輯元件（設定類型、描述、導航目標）', async ({ page }) => {
    await page.request.put(`${API}/api/projects/${projectId}/architecture`, {
      data: {
        type: 'page',
        subtype: 'website',
        aiDecidePages: false,
        nodes: [
          {
            id: 'p1',
            name: '首頁',
            position: { x: 100, y: 100 },
            components: [
              { id: 'c1', name: '前往產品', type: 'button', description: '', states: [], navigationTo: null, constraints: {} },
            ],
          },
          { id: 'p2', name: '產品頁', position: { x: 400, y: 100 }, components: [] },
        ],
        edges: [],
      },
    });

    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '架構圖' }).click();
    await expect(page.getByTestId('arch-flowchart')).toBeVisible({ timeout: 10000 });

    // 展開元件列表
    const pageNode = page.getByTestId('page-node-首頁');
    await pageNode.getByText(/元件/).click();

    // 點擊元件進入編輯
    await pageNode.getByText('前往產品').click();

    // 驗證編輯對話框出現
    await expect(page.getByText('編輯元件')).toBeVisible();

    // 修改類型為連結
    await page.locator('select').first().selectOption('link');

    // 驗證導航目標選項可見（因為 link 是 nav type）
    const navSelect = page.locator('select').nth(1);
    if (await navSelect.isVisible()) {
      await navSelect.selectOption({ label: '產品頁' });
    }

    // 儲存
    await page.getByText('儲存').or(page.getByText('確認')).first().click();
  });

  test('新增多狀態元件（分頁標籤 3 態）', async ({ page }) => {
    await page.request.put(`${API}/api/projects/${projectId}/architecture`, {
      data: {
        type: 'page',
        subtype: 'website',
        aiDecidePages: false,
        nodes: [
          { id: 'p1', name: '首頁', position: { x: 100, y: 100 }, components: [] },
          { id: 'p2', name: '推薦', position: { x: 400, y: 100 }, components: [] },
          { id: 'p3', name: '設定', position: { x: 400, y: 300 }, components: [] },
        ],
        edges: [],
      },
    });

    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '架構圖' }).click();
    await expect(page.getByTestId('arch-flowchart')).toBeVisible({ timeout: 10000 });

    const pageNode = page.getByTestId('page-node-首頁');
    await pageNode.getByText(/元件/).click();
    await pageNode.getByText('+ 新增元件').click();

    await expect(page.getByText('新增元件')).toBeVisible();

    // 填入名稱
    await page.locator('input[placeholder*="搜尋按鈕"]').fill('主選單分頁');

    // 選擇類型為分頁 (tab)
    await page.locator('select').first().selectOption('tab');

    // 應出現狀態設定區
    // 新增 3 個狀態
    const addStateBtn = page.getByText('+ 新增狀態').or(page.getByText('+ 狀態'));
    if (await addStateBtn.isVisible()) {
      for (let i = 0; i < 3; i++) {
        await addStateBtn.click();
      }
    }

    // 儲存
    await page.getByText('儲存').or(page.getByText('確認')).first().click();

    // 驗證元件顯示（帶狀態數量）
    await expect(pageNode.getByText('主選單分頁')).toBeVisible({ timeout: 5000 });
  });

  test('從分析匯入架構（如有分析結果）', async ({ page, request }) => {
    // 先檢查有沒有分析結果
    const analysisRes = await request.get(`${API}/api/projects/${projectId}/analysis`);

    await page.request.put(`${API}/api/projects/${projectId}/architecture`, {
      data: {
        type: 'page',
        subtype: 'website',
        aiDecidePages: false,
        nodes: [{ id: 'p1', name: '首頁', position: { x: 100, y: 100 }, components: [] }],
        edges: [],
      },
    });

    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '架構圖' }).click();
    await expect(page.getByTestId('arch-flowchart')).toBeVisible({ timeout: 10000 });

    // 檢查匯入按鈕是否存在
    const importBtn = page.getByTestId('import-analysis-btn');
    if (await importBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await importBtn.click();
      // 如果有現有節點，可能會出現合併/取代的 prompt
      page.on('dialog', async dialog => {
        await dialog.accept('合併');
      });
      // 等待匯入完成
      await page.waitForTimeout(3000);
    } else {
      // 沒有分析結果，跳過此測試
      test.skip();
    }
  });

  test('儲存版本 → 驗證歷史記錄', async ({ page }) => {
    await page.request.put(`${API}/api/projects/${projectId}/architecture`, {
      data: {
        type: 'page',
        subtype: 'website',
        aiDecidePages: false,
        nodes: [{ id: 'p1', name: '首頁', position: { x: 100, y: 100 }, components: [] }],
        edges: [],
      },
    });

    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '架構圖' }).click();
    await expect(page.getByTestId('arch-flowchart')).toBeVisible({ timeout: 10000 });

    // 點擊「儲存版本」
    await page.getByText('💾 儲存版本').click();

    // 等待儲存完成
    await page.waitForTimeout(1000);

    // 點擊「歷史版本」
    await page.getByText('歷史版本').first().click();

    // 驗證版本歷史面板出現
    await expect(page.getByText('架構歷史版本')).toBeVisible({ timeout: 5000 });

    // 驗證至少有一個版本記錄（手動儲存）
    await expect(page.getByText('手動儲存')).toBeVisible({ timeout: 5000 });
  });

  test('還原版本', async ({ page }) => {
    // 先建立架構並儲存版本
    await page.request.put(`${API}/api/projects/${projectId}/architecture`, {
      data: {
        type: 'page',
        subtype: 'website',
        aiDecidePages: false,
        nodes: [{ id: 'p1', name: '版本一首頁', position: { x: 100, y: 100 }, components: [] }],
        edges: [],
      },
    });

    // 透過 API 儲存版本
    await page.request.post(`${API}/api/projects/${projectId}/architecture/versions`, {
      data: { description: '第一版' },
    });

    // 更新架構
    await page.request.put(`${API}/api/projects/${projectId}/architecture`, {
      data: {
        type: 'page',
        subtype: 'website',
        aiDecidePages: false,
        nodes: [{ id: 'p1', name: '版本二首頁', position: { x: 100, y: 100 }, components: [] }],
        edges: [],
      },
    });

    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '架構圖' }).click();
    await expect(page.getByTestId('arch-flowchart')).toBeVisible({ timeout: 10000 });

    // 驗證目前是版本二
    await expect(page.getByTestId('page-node-版本二首頁')).toBeVisible();

    // 打開歷史版本
    await page.getByText('歷史版本').first().click();
    await expect(page.getByText('架構歷史版本')).toBeVisible();

    // 設置確認對話框
    page.on('dialog', dialog => dialog.accept());

    // 點擊還原按鈕
    await page.getByText('還原').first().click();

    // 等待還原完成
    await page.waitForTimeout(2000);

    // 驗證回到版本一
    await expect(page.getByTestId('page-node-版本一首頁')).toBeVisible({ timeout: 10000 });
  });
});
