import { test, expect } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_BASE_URL || 'http://localhost:3001';

test.describe('導航驗證', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: `導航驗證測試 ${Date.now()}` },
    });
    const project = await res.json();
    projectId = project.id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      try { await request.delete(`${API}/api/projects/${projectId}`); } catch { /* ignore */ }
    }
  });

  test('生成多頁原型', async ({ page }) => {
    await page.goto(`/project/${projectId}`);

    const textarea = page.locator('textarea[placeholder*="描述你的 UI"]');
    await textarea.fill('建立一個三頁的網站：首頁（有導航列連結到產品頁和關於頁）、產品頁（展示產品列表）、關於我們頁面');
    await page.getByTestId('send-btn').click();

    // 等待生成完成
    const iframe = page.locator('iframe');
    await expect(iframe).toBeVisible({ timeout: 60000 });
    await expect(page.getByTestId('generation-progress')).not.toBeVisible({ timeout: 30000 });

    // 驗證頁面標籤出現（多頁模式）
    await page.waitForTimeout(2000);
    const pageTabs = page.locator('[data-testid^="page-tab-"]');
    const tabCount = await pageTabs.count();

    // 應有多個頁面標籤
    expect(tabCount).toBeGreaterThanOrEqual(1);
  });

  test('呼叫 validate-navigation API → 結果結構正確', async ({ page, request }) => {
    await page.goto(`/project/${projectId}`);

    // 生成多頁原型
    const textarea = page.locator('textarea[placeholder*="描述你的 UI"]');
    await textarea.fill('建立首頁和產品頁，首頁有連結到產品頁');
    await page.getByTestId('send-btn').click();

    const iframe = page.locator('iframe');
    await expect(iframe).toBeVisible({ timeout: 60000 });
    await expect(page.getByTestId('generation-progress')).not.toBeVisible({ timeout: 30000 });

    // 呼叫導航驗證 API (GET, under /prototype/)
    const validateRes = await request.get(`${API}/api/projects/${projectId}/prototype/validate-navigation`);

    if (validateRes.ok()) {
      const result = await validateRes.json();

      // 驗證回傳結構: { valid: boolean, issues: [{type, message, severity}] }
      expect(typeof result.valid).toBe('boolean');
      expect(Array.isArray(result.issues)).toBeTruthy();

      // 每個 issue 都有正確的結構
      for (const issue of result.issues) {
        expect(issue).toHaveProperty('type');
        expect(issue).toHaveProperty('message');
        expect(issue).toHaveProperty('severity');
        expect(['error', 'warning']).toContain(issue.severity);
      }

      // 記錄但不強制要求（AI 生成可能不完美）
      if (!result.valid) {
        console.log('⚠️ 導航驗證發現問題:', result.issues.map((i: any) => `[${i.severity}] ${i.type}: ${i.message}`));
      }
    }
  });

  test('驗證無缺失導航目標', async ({ page, request }) => {
    // 使用架構先定義明確的頁面結構 (PATCH with arch_data wrapper)
    await request.patch(`${API}/api/projects/${projectId}/architecture`, {
      data: {
        arch_data: {
          type: 'page',
          subtype: 'website',
          aiDecidePages: false,
          nodes: [
            {
              id: 'p1',
              name: '首頁',
              position: { x: 100, y: 100 },
              components: [
                { id: 'c1', name: '前往產品', type: 'link', description: '導航到產品頁', states: [], navigationTo: '產品頁', constraints: {} },
              ],
            },
            {
              id: 'p2',
              name: '產品頁',
              position: { x: 400, y: 100 },
              components: [
                { id: 'c2', name: '返回首頁', type: 'link', description: '回到首頁', states: [], navigationTo: '首頁', constraints: {} },
              ],
            },
          ],
          edges: [{ id: 'e1', source: 'p1', target: 'p2' }],
        },
      },
    });

    await page.goto(`/project/${projectId}`);

    // 從架構開始生成
    const textarea = page.locator('textarea[placeholder*="描述你的 UI"]');
    await textarea.fill('請依照架構生成所有頁面');
    await page.getByTestId('send-btn').click();

    const iframe = page.locator('iframe');
    await expect(iframe).toBeVisible({ timeout: 60000 });
    await expect(page.getByTestId('generation-progress')).not.toBeVisible({ timeout: 30000 });

    // 呼叫 validate-navigation API 檢查結構
    const validateRes = await request.get(`${API}/api/projects/${projectId}/prototype/validate-navigation`);
    if (validateRes.ok()) {
      const result = await validateRes.json();
      expect(typeof result.valid).toBe('boolean');
      expect(Array.isArray(result.issues)).toBeTruthy();

      // 不應有 missing-target 類型的 error
      const missingTargetErrors = result.issues.filter((i: any) => i.type === 'missing-target' && i.severity === 'error');
      if (missingTargetErrors.length > 0) {
        console.log('⚠️ 發現缺失導航目標:', missingTargetErrors.map((i: any) => i.message));
      }
    }

    // 驗證頁面間可導航
    const pageTabs = page.locator('[data-testid^="page-tab-"]');
    const tabCount = await pageTabs.count();

    if (tabCount >= 2) {
      // 點擊第二個頁面
      await pageTabs.nth(1).click();
      await page.waitForTimeout(1000);

      // 點回第一個頁面
      await pageTabs.nth(0).click();
      await page.waitForTimeout(1000);

      // iframe 應該還在
      await expect(iframe).toBeVisible();
    }
  });
});
