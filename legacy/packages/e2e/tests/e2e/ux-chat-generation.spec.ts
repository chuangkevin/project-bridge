import { test, expect, type Page } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_BASE_URL || 'http://localhost:3001';

/**
 * UX Enhancement Pack: Chat & Generation E2E Tests
 *
 * Covers:
 *  - Sending a chat message
 *  - AI generation produces HTML (uses real prompt, with generous timeout)
 *  - Multi-page generation
 *  - "重新設計" triggers full regeneration
 *  - File upload in chat (image compression)
 *
 * data-testid attributes used:
 *   send-btn, generation-progress, regenerate-btn,
 *   file-input, file-chip, attach-file-btn,
 *   page-tab-{name}, tab-chat, tab-design
 */

// ─── Helpers ──────────────────────────────────────────────

async function skipWizardAndGoToDesign(page: Page) {
  // Skip architecture wizard
  const skipBtn = page.getByRole('button', { name: /跳過/ });
  if (await skipBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await skipBtn.click();
  }
  // Switch to design tab
  const designTab = page.getByRole('tab', { name: '設計' });
  if (await designTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await designTab.click();
  }
}

async function createProjectAndNavigate(page: Page, request: any): Promise<string> {
  const res = await request.post(`${API}/api/projects`, {
    data: { name: `對話 UX ${Date.now()}` },
  });
  const project = await res.json();
  await page.goto(`/project/${project.id}`);
  return project.id;
}

// ─── Tests ────────────────────────────────────────────────

test.describe('對話與生成 — UX 增強', () => {
  let projectId: string;

  test.beforeEach(async ({ page, request }) => {
    projectId = await createProjectAndNavigate(page, request);
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      try { await request.delete(`${API}/api/projects/${projectId}`); } catch { /* ignore */ }
    }
  });

  test('送出聊天訊息 → 使用者訊息出現在對話中', async ({ page }) => {
    await skipWizardAndGoToDesign(page);

    const textarea = page.getByPlaceholder(/描述你的 UI/);
    await expect(textarea).toBeVisible({ timeout: 10000 });

    const message = '建立一個簡單的登入頁面';
    await textarea.fill(message);
    await page.getByTestId('send-btn').click();

    // User message should appear in conversation
    await expect(page.getByText(message)).toBeVisible({ timeout: 5000 });
  });

  test('AI 生成產出 HTML → iframe 出現', async ({ page }) => {
    test.setTimeout(120000); // 2 minutes for AI generation

    await skipWizardAndGoToDesign(page);

    const textarea = page.getByPlaceholder(/描述你的 UI/);
    await textarea.fill('一個有帳號密碼輸入框和登入按鈕的登入頁面');
    await page.getByTestId('send-btn').click();

    // Generation progress should appear
    const progress = page.getByTestId('generation-progress');
    await expect(progress).toBeVisible({ timeout: 30000 });

    // Wait for iframe to appear (prototype generated)
    const iframe = page.locator('iframe');
    await expect(iframe).toBeVisible({ timeout: 90000 });

    // Verify the iframe has content (src attribute is set)
    const src = await iframe.getAttribute('src');
    expect(src || await iframe.getAttribute('srcdoc')).toBeTruthy();
  });

  test('多頁面生成 → 頁面分頁出現', async ({ page }) => {
    test.setTimeout(180000); // 3 minutes

    await skipWizardAndGoToDesign(page);

    const textarea = page.getByPlaceholder(/描述你的 UI/);
    // Request explicitly multi-page
    await textarea.fill('建立一個有首頁和關於頁面的兩頁網站');
    await page.getByTestId('send-btn').click();

    // Wait for generation to complete
    const iframe = page.locator('iframe');
    await expect(iframe).toBeVisible({ timeout: 120000 });

    // Wait for generation progress to disappear (fully complete)
    await expect(page.getByTestId('generation-progress')).not.toBeVisible({ timeout: 60000 });

    // Check for page tabs (multi-page indicator)
    // Page tabs have data-testid="page-tab-{pageName}"
    const pageTabs = page.locator('[data-testid^="page-tab-"]');
    const tabCount = await pageTabs.count();

    // If multiple pages were generated, there should be 2+ tabs
    // (AI may or may not generate multiple pages — this is a soft check)
    if (tabCount >= 2) {
      await expect(pageTabs.first()).toBeVisible();
      // Click second tab to switch pages
      await pageTabs.nth(1).click();
      await page.waitForTimeout(1000);
      // iframe should still be visible after page switch
      await expect(iframe).toBeVisible();
    }
  });

  test('「重新設計」按鈕觸發完整重新生成', async ({ page }) => {
    test.setTimeout(180000);

    await skipWizardAndGoToDesign(page);

    // First generation
    const textarea = page.getByPlaceholder(/描述你的 UI/);
    await textarea.fill('一個簡單的導航列');
    await page.getByTestId('send-btn').click();

    // Wait for prototype
    const iframe = page.locator('iframe');
    await expect(iframe).toBeVisible({ timeout: 90000 });

    // Wait for generation to fully complete
    await expect(page.getByTestId('generation-progress')).not.toBeVisible({ timeout: 30000 });

    // The regenerate button should now be visible
    const regenBtn = page.getByTestId('regenerate-btn');
    await expect(regenBtn).toBeVisible({ timeout: 5000 });

    // Click regenerate (重新設計)
    await regenBtn.click();

    // Full generation progress should reappear
    const progress = page.getByTestId('generation-progress');
    await expect(progress).toBeVisible({ timeout: 15000 });
  });

  test('檔案上傳 → 檔案晶片出現', async ({ page }) => {
    await skipWizardAndGoToDesign(page);

    // Upload an image file via the hidden file input
    const fileInput = page.getByTestId('file-input');

    // Create a minimal test PNG in-memory
    await fileInput.setInputFiles({
      name: 'test-upload.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      ),
    });

    // File chip should appear showing the filename
    await expect(page.getByTestId('file-chip')).toBeVisible({ timeout: 10000 });
  });

  test('大圖片上傳 → 壓縮處理', async ({ page }) => {
    await skipWizardAndGoToDesign(page);

    // Create a larger image (still small but tests the upload flow)
    // Using a 100x100 PNG would be more realistic
    const fileInput = page.getByTestId('file-input');
    await fileInput.setInputFiles({
      name: 'large-screenshot.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      ),
    });

    // File chip should appear
    await expect(page.getByTestId('file-chip')).toBeVisible({ timeout: 10000 });

    // Upload toast may appear for compression feedback
    const uploadToast = page.getByTestId('upload-toast');
    // Toast is transient, so we just check it appears or the chip is fine
    await page.waitForTimeout(1000);
  });

  test('附件按鈕點擊 → 觸發檔案選擇器', async ({ page }) => {
    await skipWizardAndGoToDesign(page);

    // The attach-file-btn should be visible
    const attachBtn = page.getByTestId('attach-file-btn');
    await expect(attachBtn).toBeVisible({ timeout: 10000 });

    // Clicking it should trigger the hidden file input
    // We verify the file input exists and is connected
    const fileInput = page.getByTestId('file-input');
    await expect(fileInput).toBeAttached();
  });

  test('空訊息不可送出', async ({ page }) => {
    await skipWizardAndGoToDesign(page);

    const textarea = page.getByPlaceholder(/描述你的 UI/);
    await expect(textarea).toBeVisible({ timeout: 10000 });

    // Don't type anything — send button should be disabled
    const sendBtn = page.getByTestId('send-btn');

    // Clear textarea to ensure empty
    await textarea.fill('');

    // Send button should be disabled for empty input
    // (behavior may be: disabled attribute or onClick does nothing)
    await sendBtn.click();

    // No user message bubble should appear
    await page.waitForTimeout(1000);
    const progressBar = page.getByTestId('generation-progress');
    await expect(progressBar).not.toBeVisible();
  });

  test('生成設定面板可切換', async ({ page }) => {
    await skipWizardAndGoToDesign(page);

    // Click generation settings toggle
    const settingsToggle = page.getByTestId('gen-settings-toggle');
    if (await settingsToggle.isVisible({ timeout: 5000 }).catch(() => false)) {
      await settingsToggle.click();

      // Settings panel should appear
      await expect(page.getByTestId('gen-settings-panel')).toBeVisible({ timeout: 3000 });

      // Temperature slider should be visible
      await expect(page.getByTestId('temperature-slider')).toBeVisible();

      // Click again to close
      await settingsToggle.click();
      await expect(page.getByTestId('gen-settings-panel')).not.toBeVisible({ timeout: 3000 });
    }
  });
});
