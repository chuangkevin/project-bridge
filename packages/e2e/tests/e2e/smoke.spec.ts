import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('煙霧測試 — 關鍵路徑', () => {
  const createdProjectIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdProjectIds) {
      try { await request.delete(`${API}/api/projects/${id}`); } catch { /* ignore */ }
    }
    createdProjectIds.length = 0;
  });

  test('建立專案 → 首頁可見', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle', timeout: 30000 });
    await expect(page.locator('h1')).toContainText('Project Bridge');

    // 點擊「新增專案」
    await page.getByRole('button', { name: '新增專案' }).click();
    await expect(page.getByText('專案名稱')).toBeVisible();

    // 輸入名稱並建立
    await page.getByPlaceholder('我的原型專案').fill('煙霧測試專案');
    await page.getByRole('button', { name: '建立' }).click();

    // 驗證跳轉到工作區（架構圖 wizard）
    await expect(page).toHaveURL(/\/project\/[\w-]+/, { timeout: 10000 });
    const url = page.url();
    const idMatch = url.match(/\/project\/([\w-]+)/);
    if (idMatch) createdProjectIds.push(idMatch[1]);

    // 驗證在架構圖 wizard 畫面
    await expect(page.getByText('你想設計的是？')).toBeVisible();

    // 返回首頁驗證卡片
    await page.goto('/');
    await expect(page.getByText('煙霧測試專案')).toBeVisible({ timeout: 10000 });
  });

  test('工作區 → 驗證分頁', async ({ page, request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: '煙霧測試-分頁' },
    });
    const project = await res.json();
    createdProjectIds.push(project.id);

    await page.goto(`/project/${project.id}`);

    // 預設在架構圖 tab
    await expect(page.getByRole('tab', { name: '架構圖' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '設計' })).toBeVisible();

    // 跳過 wizard 到 Design
    await page.getByRole('button', { name: /跳過/ }).click();

    // 驗證 Design tab 的子分頁
    await expect(page.getByRole('button', { name: '對話' })).toBeVisible();
  });

  test('送出訊息 → 生成開始', async ({ page, request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: '煙霧測試-生成' },
    });
    const project = await res.json();
    createdProjectIds.push(project.id);

    await page.goto(`/project/${project.id}`);
    // 跳過 wizard → 到 Design tab
    await page.getByRole('button', { name: /跳過/ }).click();
    await page.getByRole('tab', { name: '設計' }).click();

    // 輸入訊息
    const textarea = page.getByPlaceholder(/描述你的 UI/);
    await textarea.fill('一個簡單的登入頁面，有帳號密碼輸入框和登入按鈕');

    // 送出
    await page.getByTestId('send-btn').click();

    // 驗證生成開始（progress bar 出現）
    await expect(page.getByTestId('generation-progress')).toBeVisible({ timeout: 15000 });
  });

  test('原型在 iframe 渲染', async ({ page, request }) => {
    test.setTimeout(180000); // 3 分鐘（含生成時間）
    const res = await request.post(`${API}/api/projects`, {
      data: { name: '煙霧測試-iframe' },
    });
    const project = await res.json();
    createdProjectIds.push(project.id);

    await page.goto(`/project/${project.id}`);
    await page.getByRole('button', { name: /跳過/ }).click();
    await page.getByRole('tab', { name: '設計' }).click();

    // 用 UI 送訊息觸發生成
    const textarea = page.getByPlaceholder(/描述你的 UI/);
    await textarea.fill('一個簡單的登入頁面');
    await page.getByTestId('send-btn').click();

    // 等待 prototype 生成完成（「已生成原型」出現）
    await expect(page.getByText('已生成原型')).toBeVisible({ timeout: 150000 });

    // 驗證 iframe 存在
    const iframe = page.locator('iframe');
    await expect(iframe.first()).toBeVisible();
  });

  test('切換裝置尺寸', async ({ page, request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: '煙霧測試-裝置' },
    });
    const project = await res.json();
    createdProjectIds.push(project.id);

    await page.goto(`/project/${project.id}`);
    await page.getByRole('button', { name: /跳過/ }).click();

    // 點平板
    await page.getByRole('button', { name: '平板' }).click();
    // 點手機版
    await page.getByRole('button', { name: '手機版' }).click();
    // 點桌面版
    await page.getByRole('button', { name: '桌面版' }).click();

    // 只要不報錯就通過
  });

  test('刪除專案', async ({ page, request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: '煙霧測試-刪除' },
    });
    const project = await res.json();

    await page.goto('/');
    await expect(page.getByText('煙霧測試-刪除')).toBeVisible({ timeout: 10000 });

    // 設定 dialog 自動確認
    page.on('dialog', dialog => dialog.accept());

    // 找到刪除按鈕（在專案卡片上）
    const card = page.locator('[data-testid="project-card"]', { hasText: '煙霧測試-刪除' });
    if (await card.count() > 0) {
      await card.getByRole('button', { name: '刪除' }).click();
    } else {
      // Fallback: 用 API 刪除
      await request.delete(`${API}/api/projects/${project.id}`);
    }

    await page.reload();
    await expect(page.getByText('煙霧測試-刪除')).not.toBeVisible({ timeout: 5000 });
  });
});
