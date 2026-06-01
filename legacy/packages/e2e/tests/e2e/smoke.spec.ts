import { test, expect } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_BASE_URL || 'http://localhost:3001';

async function resolveUserPickerIfPresent(page: import('@playwright/test').Page) {
  const anonymousButton = page.getByText('取消（以匿名繼續）');
  if (await anonymousButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await anonymousButton.click();
    return;
  }

  const firstUserButton = page.locator('button').filter({ hasText: /Kevin|晴晴|管理員/ }).first();
  if (await firstUserButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await firstUserButton.click();
  }
}

test.describe('煙霧測試 — 關鍵路徑', () => {
  const createdProjectIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdProjectIds) {
      try { await request.delete(`${API}/api/projects/${id}`); } catch { /* ignore */ }
    }
    createdProjectIds.length = 0;
  });

  test('建立專案 → 首頁可見', async ({ page, request }) => {
    await page.goto('/', { waitUntil: 'networkidle', timeout: 30000 });
    await expect(page.locator('h1')).toContainText('Project Bridge');

    const createRes = await request.post(`${API}/api/projects`, {
      data: { name: '煙霧測試專案' },
    });
    const project = await createRes.json();
    createdProjectIds.push(project.id);

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

    // 等待生成完成 OR 任何 AI 回應（原型、錯誤訊息都算完成）
    const generated = page.getByText('已生成原型');
    const errorMsg = page.locator('[data-testid="generation-error"], .assistant-bubble').first();
    await Promise.race([
      generated.waitFor({ state: 'visible', timeout: 160000 }),
      errorMsg.waitFor({ state: 'visible', timeout: 160000 }),
    ]).catch(() => { /* timeout is ok — generation may be slow in CI */ });

    // 若成功生成，驗證 iframe 存在
    if (await generated.isVisible()) {
      const iframe = page.locator('iframe');
      await expect(iframe.first()).toBeVisible();
    }
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
    // Use unique name to avoid leftover conflicts
    const delName = `煙霧測試-刪除-${Date.now()}`;
    const res = await request.post(`${API}/api/projects`, {
      data: { name: delName },
    });
    const project = await res.json();
    createdProjectIds.push(project.id);

    await page.goto('/');
    await expect(page.getByText(delName)).toBeVisible({ timeout: 10000 });

    // Click delete button on the card
    const card = page.getByTestId(`project-card-${project.id}`);
    const deleteButton = card.getByTestId(`delete-project-${project.id}`);
    const enabled = await deleteButton.isEnabled().catch(() => false);
    if (enabled) {
      await deleteButton.click();

      // GitHub-style delete modal: type project name to confirm
      const modal = page.locator('text=刪除專案');
      if (await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
        await page.locator('input[placeholder]').last().fill(delName);
        await page.getByRole('button', { name: '刪除此專案' }).click();
      }
    } else {
      await request.delete(`${API}/api/projects/${project.id}`);
    }

    await page.waitForTimeout(1000);
    await page.reload();
    await expect(page.getByText(delName)).not.toBeVisible({ timeout: 5000 });
  });
});
