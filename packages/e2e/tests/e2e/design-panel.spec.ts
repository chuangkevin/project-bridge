import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('E2E: Design Panel', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: `Design Panel E2E ${Date.now()}` },
    });
    const project = await res.json();
    projectId = project.id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      await request.delete(`${API}/api/projects/${projectId}`);
    }
  });

  test('Chat and Design tabs are visible, Chat is default', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '設計' }).click();
    await expect(page.getByTestId('tab-chat')).toBeVisible();
    await expect(page.getByTestId('tab-design')).toBeVisible();
    // Chat panel should be visible by default
    await expect(page.getByPlaceholder('描述你的 UI...（可貼上截圖）')).toBeVisible();
    // Design panel should NOT be visible
    await expect(page.getByTestId('design-description')).not.toBeVisible();
  });

  test('clicking Design tab shows DesignPanel', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '設計' }).click();
    await page.getByTestId('tab-design').click();
    await expect(page.getByTestId('design-description')).toBeVisible();
    await expect(page.getByTestId('add-reference-btn')).toBeVisible();
    await expect(page.getByTestId('token-primary-color')).toBeVisible();
    await expect(page.getByTestId('token-secondary-color')).toBeVisible();
    await expect(page.getByTestId('token-font-family')).toBeVisible();
    await expect(page.getByTestId('token-border-radius')).toBeVisible();
    await expect(page.getByTestId('token-spacing')).toBeVisible();
    await expect(page.getByTestId('token-shadow')).toBeVisible();
    await expect(page.getByTestId('save-design-btn')).toBeVisible();
  });

  test('switching back to Chat tab shows ChatPanel', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '設計' }).click();
    await page.getByTestId('tab-design').click();
    await expect(page.getByTestId('design-description')).toBeVisible();

    await page.getByTestId('tab-chat').click();
    await expect(page.getByPlaceholder('描述你的 UI...（可貼上截圖）')).toBeVisible();
    await expect(page.getByTestId('design-description')).not.toBeVisible();
  });

  test('fill description and save shows success toast', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '設計' }).click();
    await page.getByTestId('tab-design').click();

    await page.getByTestId('design-description').fill('現代簡約，企業感，主打信任感');
    await page.getByTestId('save-design-btn').click();

    await expect(page.getByText('已儲存，下次生成將套用此設計')).toBeVisible({ timeout: 5000 });
  });

  test('set border radius slider and change font, then save', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '設計' }).click();
    await page.getByTestId('tab-design').click();

    // Change font family
    await page.getByTestId('token-font-family').selectOption('serif');

    // Change border radius slider to 16
    const slider = page.getByTestId('token-border-radius');
    await slider.fill('16');
    await slider.dispatchEvent('input');

    // Save
    await page.getByTestId('save-design-btn').click();
    await expect(page.getByText('已儲存，下次生成將套用此設計')).toBeVisible({ timeout: 5000 });
  });

  test('description persists after page reload', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '設計' }).click();
    await page.getByTestId('tab-design').click();

    const desc = '設計風格測試 — 現代感科技風';
    await page.getByTestId('design-description').fill(desc);
    await page.getByTestId('save-design-btn').click();
    await expect(page.getByText('已儲存，下次生成將套用此設計')).toBeVisible({ timeout: 5000 });

    // Reload and check
    await page.reload();
    await page.getByRole('tab', { name: '設計' }).click();
    await page.getByTestId('tab-design').click();
    await expect(page.getByTestId('design-description')).toHaveValue(desc, { timeout: 5000 });
  });

  test('Design Active badge appears after saving design profile', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '設計' }).click();

    // Badge should NOT be visible initially (no design profile yet)
    await expect(page.getByTestId('design-active-badge')).not.toBeVisible();

    // Go to design tab and save
    await page.getByTestId('tab-design').click();
    await page.getByTestId('design-description').fill('啟用設計規格測試');
    await page.getByTestId('save-design-btn').click();
    await expect(page.getByText('已儲存，下次生成將套用此設計')).toBeVisible({ timeout: 5000 });

    // Badge should now be visible
    await expect(page.getByTestId('design-active-badge')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('design-active-badge')).toContainText('Design Active');
  });

  test('Design Active badge visible on reload after saving', async ({ page, request }) => {
    // Save design via API
    await request.put(`${API}/api/projects/${projectId}/design`, {
      data: { description: 'Pre-saved design profile' },
    });

    // Load the workspace — badge should already be active
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '設計' }).click();
    await expect(page.getByTestId('design-active-badge')).toBeVisible({ timeout: 5000 });
  });
});
