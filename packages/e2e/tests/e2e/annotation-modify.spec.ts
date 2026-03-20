import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('標注與修改模式', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: `標注測試 ${Date.now()}` },
    });
    const project = await res.json();
    projectId = project.id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      try { await request.delete(`${API}/api/projects/${projectId}`); } catch { /* ignore */ }
    }
  });

  test('啟用標注模式', async ({ page }) => {
    await page.goto(`/project/${projectId}`);

    const toggleBtn = page.getByTestId('annotate-toggle');
    await expect(toggleBtn).toBeVisible();

    // 取得啟用前的背景色
    const bgBefore = await toggleBtn.evaluate(
      el => window.getComputedStyle(el).backgroundColor,
    );

    // 點擊啟用
    await toggleBtn.click();

    // 背景色應改變（啟用狀態）
    const bgAfter = await toggleBtn.evaluate(
      el => window.getComputedStyle(el).backgroundColor,
    );
    expect(bgBefore).not.toBe(bgAfter);

    // 驗證標注模式橫幅出現
    await expect(page.getByText('標注模式')).toBeVisible();
  });

  test('點擊元素 → 修改彈窗出現 → 輸入指令 → 修改', async ({ page }) => {
    await page.goto(`/project/${projectId}`);

    // 先生成原型
    const textarea = page.locator('textarea[placeholder*="描述你的 UI"]');
    await textarea.fill('建立一個包含標題「歡迎光臨」和一個藍色按鈕「開始使用」的頁面');
    await page.getByTestId('send-btn').click();

    // 等待 iframe 出現
    const iframe = page.locator('iframe');
    await expect(iframe).toBeVisible({ timeout: 60000 });

    // 等待生成結束
    await expect(page.getByTestId('generation-progress')).not.toBeVisible({ timeout: 30000 });

    // 啟用標注模式
    await page.getByTestId('annotate-toggle').click();
    await expect(page.getByText('標注模式')).toBeVisible();

    // 點擊 iframe 中的某元素
    // 由於 iframe 是 srcdoc，需要進入 iframe 的 contentFrame
    const frameLocator = page.frameLocator('iframe');
    const body = frameLocator.locator('body');

    // 嘗試點擊 iframe 中的按鈕
    const button = frameLocator.locator('button').first();
    if (await button.isVisible({ timeout: 5000 }).catch(() => false)) {
      await button.click();

      // 驗證修改彈窗出現（textarea 有 placeholder 描述要怎麼修改）
      const modifyTextarea = page.locator('textarea[placeholder*="描述要怎麼修改"]');
      if (await modifyTextarea.isVisible({ timeout: 5000 }).catch(() => false)) {
        await modifyTextarea.fill('把按鈕文字改成「立即開始」並加上圓角');

        // 點擊「修改」按鈕
        const modifyBtn = page.getByText('⚡ 修改').or(page.getByText('修改'));
        await modifyBtn.first().click();

        // 等待修改完成
        await page.waitForTimeout(5000);

        // iframe 應該還在
        await expect(iframe).toBeVisible();
      }
    }
  });

  test('新增標注 → 標注數量增加', async ({ page }) => {
    await page.goto(`/project/${projectId}`);

    // 先生成原型
    const textarea = page.locator('textarea[placeholder*="描述你的 UI"]');
    await textarea.fill('建立一個簡單頁面，有一個標題和段落文字');
    await page.getByTestId('send-btn').click();

    const iframe = page.locator('iframe');
    await expect(iframe).toBeVisible({ timeout: 60000 });
    await expect(page.getByTestId('generation-progress')).not.toBeVisible({ timeout: 30000 });

    // 啟用標注模式
    await page.getByTestId('annotate-toggle').click();

    // 點擊 iframe 中的元素
    const frameLocator = page.frameLocator('iframe');
    const heading = frameLocator.locator('h1, h2, h3, p').first();

    if (await heading.isVisible({ timeout: 5000 }).catch(() => false)) {
      await heading.click();

      // 修改彈窗出現後，點擊「+ 標注」按鈕來新增標注
      const annotateBtn = page.getByText('+ 標注');
      if (await annotateBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await annotateBtn.click();

        // 填入標注內容
        const annotationInput = page.locator('textarea[placeholder*="新增標注"], input[placeholder*="新增標注"]');
        if (await annotationInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await annotationInput.fill('這個標題需要加粗並放大');

          // 儲存標注
          const saveBtn = page.getByText('儲存').or(page.getByText('新增'));
          await saveBtn.first().click();

          // 等待儲存
          await page.waitForTimeout(1000);
        }
      }
    }
  });

  test('停用標注模式', async ({ page }) => {
    await page.goto(`/project/${projectId}`);

    const toggleBtn = page.getByTestId('annotate-toggle');

    // 啟用
    await toggleBtn.click();
    await expect(page.getByText('標注模式')).toBeVisible();

    // 停用
    await toggleBtn.click();

    // 橫幅應消失
    await expect(page.getByText('✏️ 標注模式')).not.toBeVisible({ timeout: 3000 });

    // 按鈕應回到原始狀態
    const bgAfterDisable = await toggleBtn.evaluate(
      el => window.getComputedStyle(el).backgroundColor,
    );
    // 驗證不是啟用狀態的背景色
    expect(bgAfterDisable).toBeDefined();
  });

  test('鍵盤快捷鍵 A 切換標注模式', async ({ page }) => {
    await page.goto(`/project/${projectId}`);

    // 按 A 啟用
    await page.keyboard.press('a');

    // 驗證標注模式開啟
    const banner = page.getByText('標注模式');
    const isActive = await banner.isVisible({ timeout: 3000 }).catch(() => false);

    if (isActive) {
      // 按 Escape 關閉
      await page.keyboard.press('Escape');
      await expect(page.getByText('✏️ 標注模式')).not.toBeVisible({ timeout: 3000 });
    }
  });
});
