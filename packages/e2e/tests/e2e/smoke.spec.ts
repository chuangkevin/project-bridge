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
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Project Bridge');

    // 點擊「新增專案」
    await page.getByTestId('new-project-btn').click();
    await expect(page.getByText('專案名稱')).toBeVisible();

    // 輸入名稱並建立
    await page.getByPlaceholder('我的原型專案').fill('煙霧測試專案');
    await page.getByTestId('create-project-btn').click();

    // 驗證跳轉到工作區
    await expect(page).toHaveURL(/\/project\/[\w-]+/, { timeout: 10000 });
    const url = page.url();
    const idMatch = url.match(/\/project\/([\w-]+)/);
    if (idMatch) createdProjectIds.push(idMatch[1]);

    // 驗證專案名稱顯示
    await expect(page.getByText('煙霧測試專案')).toBeVisible();

    // 返回首頁驗證卡片
    await page.getByTestId('home-btn').click();
    await expect(page).toHaveURL('/');
    await expect(page.getByText('煙霧測試專案')).toBeVisible();
  });

  test('工作區 → 驗證分頁', async ({ page, request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: '煙霧測試-分頁' },
    });
    const project = await res.json();
    createdProjectIds.push(project.id);

    await page.goto(`/project/${project.id}`);

    // 驗證左側面板分頁
    await expect(page.getByTestId('tab-chat')).toBeVisible();
    await expect(page.getByTestId('tab-design')).toBeVisible();
    await expect(page.getByTestId('tab-style')).toBeVisible();

    // 驗證上方模式分頁
    await expect(page.getByRole('tab', { name: '設計' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '架構圖' })).toBeVisible();

    // 驗證裝置選擇器
    await expect(page.getByTestId('device-desktop')).toBeVisible();
    await expect(page.getByTestId('device-tablet')).toBeVisible();
    await expect(page.getByTestId('device-mobile')).toBeVisible();
  });

  test('上傳 PDF → 分析徽章出現', async ({ page, request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: '煙霧測試-上傳' },
    });
    const project = await res.json();
    createdProjectIds.push(project.id);

    await page.goto(`/project/${project.id}`);
    await expect(page.getByTestId('tab-chat')).toBeVisible();

    // 上傳 PDF 檔案
    const fileInput = page.getByTestId('file-input');
    await fileInput.setInputFiles('../../docs/需求文件/新好房【網B後台】批次自動刷新設定_規格書.pdf');

    // 驗證檔案晶片出現
    await expect(page.getByTestId('file-chip')).toBeVisible({ timeout: 10000 });

    // 驗證分析徽章出現（分析中... 或 分析完成）
    const analysisBadge = page.getByTestId('analysis-badge').or(page.getByTestId('analysis-ready-badge'));
    await expect(analysisBadge.first()).toBeVisible({ timeout: 30000 });
  });

  test('送出訊息 → 生成開始', async ({ page, request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: '煙霧測試-生成' },
    });
    const project = await res.json();
    createdProjectIds.push(project.id);

    await page.goto(`/project/${project.id}`);

    // 輸入訊息
    const textarea = page.locator('textarea[placeholder*="描述你的 UI"]');
    await expect(textarea).toBeVisible();
    await textarea.fill('建立一個簡單的登入頁面，包含帳號密碼輸入欄位和登入按鈕');
    await page.getByTestId('send-btn').click();

    // 驗證使用者訊息出現
    await expect(page.getByText('建立一個簡單的登入頁面')).toBeVisible({ timeout: 5000 });

    // 驗證生成進度出現（思考中 / 並行生成中）
    const progress = page.getByTestId('generation-progress');
    await expect(progress).toBeVisible({ timeout: 30000 });
  });

  test('原型在 iframe 渲染', async ({ page, request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: '煙霧測試-iframe' },
    });
    const project = await res.json();
    createdProjectIds.push(project.id);

    await page.goto(`/project/${project.id}`);

    // 送訊息生成
    const textarea = page.locator('textarea[placeholder*="描述你的 UI"]');
    await textarea.fill('建立一個 Hello World 頁面');
    await page.getByTestId('send-btn').click();

    // 等待 iframe 出現
    const iframe = page.locator('iframe');
    await expect(iframe).toBeVisible({ timeout: 60000 });

    // 驗證 iframe 有 src 或 srcdoc
    await expect(iframe).toHaveAttribute('srcdoc', /.+/, { timeout: 5000 }).catch(() => {
      // 可能是 src 而非 srcdoc
      return expect(iframe).toHaveAttribute('src', /.+/);
    });
  });

  test('切換裝置尺寸', async ({ page, request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: '煙霧測試-裝置' },
    });
    const project = await res.json();
    createdProjectIds.push(project.id);

    await page.goto(`/project/${project.id}`);

    // 點擊平板
    const tabletBtn = page.getByTestId('device-tablet');
    await tabletBtn.click();
    // 驗證平板按鈕為選中狀態（藍色文字）
    await expect(tabletBtn).toHaveCSS('color', 'rgb(59, 130, 246)');

    // 點擊手機
    const mobileBtn = page.getByTestId('device-mobile');
    await mobileBtn.click();
    await expect(mobileBtn).toHaveCSS('color', 'rgb(59, 130, 246)');

    // 回到桌面
    const desktopBtn = page.getByTestId('device-desktop');
    await desktopBtn.click();
    await expect(desktopBtn).toHaveCSS('color', 'rgb(59, 130, 246)');
  });

  test('刪除專案', async ({ page, request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: '煙霧測試-刪除' },
    });
    const project = await res.json();

    await page.goto('/');
    await expect(page.getByText('煙霧測試-刪除')).toBeVisible();

    // 設置確認對話框自動接受
    page.on('dialog', dialog => dialog.accept());

    // 點擊刪除按鈕
    await page.getByTestId(`delete-project-${project.id}`).click();

    // 驗證專案消失
    await expect(page.getByText('煙霧測試-刪除')).not.toBeVisible({ timeout: 5000 });
  });
});
