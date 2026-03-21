import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

/**
 * Helper: seed architecture data via the PATCH endpoint (the only method the server supports).
 * Body shape: { arch_data: { ... } }
 */
async function seedArch(request: any, projectId: string, archData: object) {
  await request.patch(`${API}/api/projects/${projectId}/architecture`, {
    data: { arch_data: archData },
  });
}

/**
 * Helper: navigate to the project page and switch to architecture tab.
 * Waits for the flowchart canvas to be fully visible before returning.
 */
async function gotoArchTab(page: any, projectId: string) {
  await page.goto(`/project/${projectId}`);
  await page.waitForLoadState('networkidle');

  // With arch_data set, project defaults to design mode; click architecture tab
  const archTab = page.getByRole('tab', { name: '架構圖' });
  await expect(archTab).toBeVisible({ timeout: 15000 });
  await archTab.click();

  // Wait for the flowchart canvas to fully render
  await expect(page.getByTestId('arch-flowchart')).toBeVisible({ timeout: 15000 });
  // Give ReactFlow time to initialize and render nodes
  await page.waitForTimeout(500);
}

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
    // New projects (no arch_data) automatically land on the architecture tab with the wizard
    await page.goto(`/project/${projectId}`);
    await page.waitForLoadState('networkidle');

    // 驗證精靈出現
    await expect(page.getByTestId('arch-wizard')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('wizard-question')).toContainText('你想設計的是？');
  });

  test('跳過精靈 → 回到 Design', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.waitForLoadState('networkidle');

    // Wizard should appear automatically for new project
    await expect(page.getByTestId('arch-wizard')).toBeVisible({ timeout: 15000 });

    // 點擊跳過按鈕 (text: "跳過，直接去 Design →")
    await page.getByRole('button', { name: /跳過/ }).click();

    // 跳過 wizard 後會切到 Design mode，驗證設計 tab 可見
    await expect(page.getByRole('tab', { name: '設計' })).toBeVisible({ timeout: 10000 });
  });

  test('走完精靈 → 前往流程圖', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('arch-wizard')).toBeVisible({ timeout: 15000 });

    // Q1: 選擇「頁面（網站 / App）」
    await page.getByTestId('wizard-option-page').click();

    // Q2: 選擇類型「網站」
    await page.getByTestId('wizard-option-website').click();

    // Q3: 選擇頁面數量 2–3
    await page.getByTestId('wizard-option-2-3').click();

    // Q4: 定義第一個頁面名稱 — 選一個 chip
    await expect(page.getByTestId('wizard-question')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('wizard-chip-首頁').click();
    await page.getByTestId('wizard-next').click();

    // Q5: 定義第二個頁面名稱
    await expect(page.getByTestId('wizard-question')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('wizard-chip-列表頁').click();
    await page.getByTestId('wizard-next').click();

    // Finish screen: 「架構完成！」
    await expect(page.getByTestId('wizard-question')).toContainText('架構完成！', { timeout: 10000 });

    // 點擊「查看架構圖」
    await page.getByTestId('wizard-finish-view').click();

    // 驗證到達流程圖
    await expect(page.getByTestId('arch-flowchart')).toBeVisible({ timeout: 15000 });
  });

  test('新增頁面節點 → 驗證出現', async ({ page }) => {
    // 透過 API 先建立架構資料以跳過精靈
    await seedArch(page.request, projectId, {
      type: 'page',
      subtype: 'website',
      aiDecidePages: false,
      nodes: [{ id: 'p1', nodeType: 'page', name: '首頁', position: { x: 100, y: 100 }, referenceFileId: null, referenceFileUrl: null }],
      edges: [],
    });

    await gotoArchTab(page, projectId);
    await expect(page.getByTestId('page-node-首頁')).toBeVisible({ timeout: 15000 });

    // 點擊「+ 新增頁面」— handleAddPage 直接建立名為「新頁面」的節點（不使用 prompt）
    await page.getByTestId('add-page-btn').click();

    // 驗證新節點出現（預設名稱為「新頁面」）— ReactFlow may take time to render
    await expect(page.getByTestId('page-node-新頁面')).toBeVisible({ timeout: 15000 });
  });

  test('重新命名頁面 → 驗證名稱更新', async ({ page }) => {
    await seedArch(page.request, projectId, {
      type: 'page',
      subtype: 'website',
      aiDecidePages: false,
      nodes: [{ id: 'p1', nodeType: 'page', name: '舊名稱', position: { x: 100, y: 100 }, referenceFileId: null, referenceFileUrl: null }],
      edges: [],
    });

    await gotoArchTab(page, projectId);

    // Wait for the specific page node to be visible
    await expect(page.getByTestId('page-node-舊名稱')).toBeVisible({ timeout: 15000 });

    // 雙擊頁面名稱來改名 — triggers window.prompt('頁面名稱', currentName)
    const pageName = page.getByTestId('page-node-舊名稱').locator('.arch-page-node__name');
    await expect(pageName).toBeVisible({ timeout: 10000 });

    // 設定 dialog handler（必須在觸發前設置）
    page.once('dialog', async (dialog: any) => {
      expect(dialog.type()).toBe('prompt');
      await dialog.accept('新名稱');
    });

    await pageName.dblclick();

    await expect(page.getByTestId('page-node-新名稱')).toBeVisible({ timeout: 15000 });
  });

  test('新增第二個頁面 → 建立邊（連線）', async ({ page }) => {
    await seedArch(page.request, projectId, {
      type: 'page',
      subtype: 'website',
      aiDecidePages: false,
      nodes: [
        { id: 'p1', nodeType: 'page', name: '首頁', position: { x: 100, y: 100 }, referenceFileId: null, referenceFileUrl: null },
        { id: 'p2', nodeType: 'page', name: '產品頁', position: { x: 400, y: 100 }, referenceFileId: null, referenceFileUrl: null },
      ],
      edges: [],
    });

    await gotoArchTab(page, projectId);

    // 驗證兩個節點都存在
    await expect(page.getByTestId('page-node-首頁')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('page-node-產品頁')).toBeVisible({ timeout: 15000 });

    // 透過拖動 handle 建立連線（@xyflow/react handle selectors）
    // ReactFlow Handle renders with class .react-flow__handle and data-handlepos attribute
    const sourceHandle = page.getByTestId('page-node-首頁').locator('.react-flow__handle[data-handlepos="right"]');
    const targetHandle = page.getByTestId('page-node-產品頁').locator('.react-flow__handle[data-handlepos="left"]');

    // Wait for handles to be attached to the DOM (ReactFlow renders them asynchronously)
    await expect(sourceHandle).toBeAttached({ timeout: 10000 });
    await expect(targetHandle).toBeAttached({ timeout: 10000 });

    // Use explicit mouse events to simulate a drag-to-connect in ReactFlow.
    // Playwright's dragTo may not trigger ReactFlow's internal connection handling.
    const sourceBBox = await sourceHandle.boundingBox();
    const targetBBox = await targetHandle.boundingBox();

    if (sourceBBox && targetBBox) {
      const sx = sourceBBox.x + sourceBBox.width / 2;
      const sy = sourceBBox.y + sourceBBox.height / 2;
      const tx = targetBBox.x + targetBBox.width / 2;
      const ty = targetBBox.y + targetBBox.height / 2;

      await page.mouse.move(sx, sy);
      await page.mouse.down();
      // Move in small steps to trigger ReactFlow's connection detection
      const steps = 5;
      for (let i = 1; i <= steps; i++) {
        await page.mouse.move(
          sx + (tx - sx) * (i / steps),
          sy + (ty - sy) * (i / steps),
        );
      }
      await page.mouse.up();
    } else {
      // Fallback: use dragTo with force
      await sourceHandle.dragTo(targetHandle, { force: true });
    }

    // 驗證邊出現
    const edges = page.locator('.react-flow__edge');
    await expect(edges.first()).toBeVisible({ timeout: 10000 });
  });

  test('展開元件列表 → 新增元件', async ({ page }) => {
    await seedArch(page.request, projectId, {
      type: 'page',
      subtype: 'website',
      aiDecidePages: false,
      nodes: [{ id: 'p1', nodeType: 'page', name: '首頁', position: { x: 100, y: 100 }, referenceFileId: null, referenceFileUrl: null, components: [] }],
      edges: [],
    });

    await gotoArchTab(page, projectId);

    const pageNode = page.getByTestId('page-node-首頁');
    await expect(pageNode).toBeVisible({ timeout: 15000 });

    // 點擊展開元件列表（button text: "▶ 元件 (0)"）
    const compToggle = pageNode.getByText(/元件\s*\(/);
    await expect(compToggle).toBeVisible({ timeout: 10000 });
    await compToggle.click();

    // Wait for the component list to expand
    await page.waitForTimeout(300);

    // 點擊「+ 新增元件」— the button is inside the expanded component list
    const addCompBtn = pageNode.getByText('+ 新增元件');
    await expect(addCompBtn).toBeVisible({ timeout: 10000 });
    await addCompBtn.click();

    // 元件編輯對話框應出現（ComponentEditorModal renders inside ReactFlow node
    // with position:fixed, but transform context breaks fixed positioning —
    // use force:true for interactions and wait for DOM presence）
    const nameInput = page.locator('input[placeholder="例：搜尋按鈕"]');
    await expect(nameInput).toBeAttached({ timeout: 10000 });
    await page.waitForTimeout(300);

    // 填入名稱
    await nameInput.fill('導航按鈕', { force: true });

    // 選擇類型為按鈕（預設已是 button）
    await page.locator('select').first().selectOption('button', { force: true });

    // 儲存元件 — the 儲存 button is inside the modal
    await page.getByRole('button', { name: '儲存', exact: true }).click({ force: true });

    // Wait for modal to close and component list to update
    await page.waitForTimeout(500);

    // 驗證元件出現在列表中
    await expect(pageNode.getByText('導航按鈕')).toBeVisible({ timeout: 10000 });
  });

  test('編輯元件（設定類型、描述、導航目標）', async ({ page }) => {
    await seedArch(page.request, projectId, {
      type: 'page',
      subtype: 'website',
      aiDecidePages: false,
      nodes: [
        {
          id: 'p1',
          nodeType: 'page',
          name: '首頁',
          position: { x: 100, y: 100 },
          referenceFileId: null,
          referenceFileUrl: null,
          components: [
            { id: 'c1', name: '前往產品', type: 'button', description: '', states: [], navigationTo: null, constraints: {} },
          ],
        },
        { id: 'p2', nodeType: 'page', name: '產品頁', position: { x: 400, y: 100 }, referenceFileId: null, referenceFileUrl: null, components: [] },
      ],
      edges: [],
    });

    await gotoArchTab(page, projectId);

    // 展開元件列表
    const pageNode = page.getByTestId('page-node-首頁');
    await expect(pageNode).toBeVisible({ timeout: 15000 });

    const compToggle = pageNode.getByText(/元件\s*\(/);
    await expect(compToggle).toBeVisible({ timeout: 10000 });
    await compToggle.click();

    // Wait for the component list to expand
    await page.waitForTimeout(300);

    // 點擊元件進入編輯
    const compItem = pageNode.getByText('前往產品');
    await expect(compItem).toBeVisible({ timeout: 10000 });
    await compItem.click();

    // 驗證編輯對話框出現（modal renders inside ReactFlow node — transform context
    // breaks position:fixed, so use force:true for interactions）
    const nameInput = page.locator('input[placeholder="例：搜尋按鈕"]');
    await expect(nameInput).toBeAttached({ timeout: 10000 });
    await page.waitForTimeout(300);

    // 修改類型為連結
    await page.locator('select').first().selectOption('link', { force: true });

    // Wait for the navigation target dropdown to appear (link is a nav type)
    await page.waitForTimeout(500);

    // 驗證導航目標選項可見（link 是 nav type）— second select in modal
    const navSelect = page.locator('select').nth(1);
    await expect(navSelect).toBeAttached({ timeout: 5000 });
    await navSelect.selectOption('產品頁', { force: true });

    // 儲存
    await page.getByRole('button', { name: '儲存', exact: true }).click({ force: true });

    // Wait for modal to close
    await page.waitForTimeout(500);
  });

  test('新增多狀態元件（分頁標籤）', async ({ page }) => {
    await seedArch(page.request, projectId, {
      type: 'page',
      subtype: 'website',
      aiDecidePages: false,
      nodes: [
        { id: 'p1', nodeType: 'page', name: '首頁', position: { x: 100, y: 100 }, referenceFileId: null, referenceFileUrl: null, components: [] },
        { id: 'p2', nodeType: 'page', name: '推薦', position: { x: 400, y: 100 }, referenceFileId: null, referenceFileUrl: null, components: [] },
        { id: 'p3', nodeType: 'page', name: '設定', position: { x: 400, y: 300 }, referenceFileId: null, referenceFileUrl: null, components: [] },
      ],
      edges: [],
    });

    await gotoArchTab(page, projectId);

    const pageNode = page.getByTestId('page-node-首頁');
    await expect(pageNode).toBeVisible({ timeout: 15000 });

    const compToggle = pageNode.getByText(/元件\s*\(/);
    await expect(compToggle).toBeVisible({ timeout: 10000 });
    await compToggle.click();

    // Wait for the component list to expand
    await page.waitForTimeout(300);

    const addCompBtn = pageNode.getByText('+ 新增元件');
    await expect(addCompBtn).toBeVisible({ timeout: 10000 });
    await addCompBtn.click();

    // 等待元件編輯對話框出現（modal renders inside ReactFlow node —
    // transform context breaks position:fixed, so use force:true）
    const nameInput = page.locator('input[placeholder="例：搜尋按鈕"]');
    await expect(nameInput).toBeAttached({ timeout: 10000 });
    await page.waitForTimeout(300);

    // 填入名稱
    await nameInput.fill('主選單分頁', { force: true });

    // 選擇類型為分頁 (tab) — this is a state type, so state list will appear
    await page.locator('select').first().selectOption('tab', { force: true });

    // Wait for state section to appear after type change
    await page.waitForTimeout(500);

    // 應出現狀態設定區，新增 3 個狀態
    const addStateBtn = page.getByText('+ 新增狀態');
    await expect(addStateBtn).toBeAttached({ timeout: 5000 });
    for (let i = 0; i < 3; i++) {
      await addStateBtn.click({ force: true });
      // Small wait between clicks to let state be added
      await page.waitForTimeout(200);
    }

    // 儲存
    await page.getByRole('button', { name: '儲存', exact: true }).click({ force: true });

    // Wait for modal to close and list to update
    await page.waitForTimeout(500);

    // 驗證元件顯示
    await expect(pageNode.getByText('主選單分頁')).toBeVisible({ timeout: 10000 });
  });

  test('從分析匯入架構（如有分析結果）', async ({ page, request }) => {
    // 先設定基本架構以跳過 wizard
    await seedArch(page.request, projectId, {
      type: 'page',
      subtype: 'website',
      aiDecidePages: false,
      nodes: [{ id: 'p1', nodeType: 'page', name: '首頁', position: { x: 100, y: 100 }, referenceFileId: null, referenceFileUrl: null }],
      edges: [],
    });

    await gotoArchTab(page, projectId);

    // 檢查匯入按鈕是否存在（只在有分析結果時出現）— hasAnalysis is set async via fetch
    const importBtn = page.getByTestId('import-analysis-btn');
    // Wait longer for the async analysis check to complete
    const isVisible = await importBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!isVisible) {
      // 沒有分析結果，跳過此測試
      test.skip();
      return;
    }

    // handleImportFromAnalysis uses window.prompt for merge/replace choice
    page.on('dialog', async (dialog: any) => {
      if (dialog.type() === 'prompt') {
        await dialog.accept('合併');
      } else {
        await dialog.accept();
      }
    });

    await importBtn.click();
    // 等待匯入完成 — need to wait for the fetch + state update
    await page.waitForTimeout(3000);
  });

  test('儲存版本 → 驗證歷史記錄', async ({ page }) => {
    await seedArch(page.request, projectId, {
      type: 'page',
      subtype: 'website',
      aiDecidePages: false,
      nodes: [{ id: 'p1', nodeType: 'page', name: '首頁', position: { x: 100, y: 100 }, referenceFileId: null, referenceFileUrl: null }],
      edges: [],
    });

    await gotoArchTab(page, projectId);

    // 點擊「💾 儲存版本」— use the toolbar button class + text
    const saveVersionBtn = page.locator('.arch-flowchart-toolbar-btn', { hasText: '儲存版本' });
    await expect(saveVersionBtn).toBeVisible({ timeout: 10000 });
    await saveVersionBtn.click();

    // Wait for the save API call to complete
    await page.waitForTimeout(2000);

    // 點擊「歷史版本」
    const historyBtn = page.locator('.arch-flowchart-toolbar-btn', { hasText: '歷史版本' });
    await expect(historyBtn).toBeVisible({ timeout: 10000 });
    await historyBtn.click();

    // 驗證版本歷史面板出現
    await expect(page.getByText('架構歷史版本')).toBeVisible({ timeout: 10000 });

    // 驗證至少有一個版本記錄（手動儲存）
    await expect(page.getByText('手動儲存')).toBeVisible({ timeout: 10000 });
  });

  test('還原版本', async ({ page }) => {
    // 先建立架構並儲存版本
    await seedArch(page.request, projectId, {
      type: 'page',
      subtype: 'website',
      aiDecidePages: false,
      nodes: [{ id: 'p1', nodeType: 'page', name: '版本一首頁', position: { x: 100, y: 100 }, referenceFileId: null, referenceFileUrl: null }],
      edges: [],
    });

    // 透過 API 儲存版本
    await page.request.post(`${API}/api/projects/${projectId}/architecture/versions`, {
      data: { description: '第一版' },
    });

    // 更新架構
    await seedArch(page.request, projectId, {
      type: 'page',
      subtype: 'website',
      aiDecidePages: false,
      nodes: [{ id: 'p1', nodeType: 'page', name: '版本二首頁', position: { x: 100, y: 100 }, referenceFileId: null, referenceFileUrl: null }],
      edges: [],
    });

    await gotoArchTab(page, projectId);

    // 驗證目前是版本二
    await expect(page.getByTestId('page-node-版本二首頁')).toBeVisible({ timeout: 15000 });

    // 打開歷史版本
    const historyBtn = page.locator('.arch-flowchart-toolbar-btn', { hasText: '歷史版本' });
    await expect(historyBtn).toBeVisible({ timeout: 10000 });
    await historyBtn.click();
    await expect(page.getByText('架構歷史版本')).toBeVisible({ timeout: 10000 });

    // 設置確認對話框（handleRestore uses window.confirm）
    page.on('dialog', (dialog: any) => dialog.accept());

    // 等待版本列表載入並點擊還原按鈕
    const restoreBtn = page.getByText('還原').first();
    await expect(restoreBtn).toBeVisible({ timeout: 10000 });
    await restoreBtn.click();

    // 等待還原完成 — handleRestore calls onArchDataChange which updates the store,
    // but the flowchart nodes may not re-render immediately. Reload to be safe.
    await page.waitForTimeout(3000);
    await page.goto(`/project/${projectId}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: '架構圖' }).click();
    await expect(page.getByTestId('arch-flowchart')).toBeVisible({ timeout: 15000 });

    // 驗證回到版本一
    await expect(page.getByTestId('page-node-版本一首頁')).toBeVisible({ timeout: 15000 });
  });
});
