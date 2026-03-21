import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('E2E: Share Page', () => {
  let projectId: string;
  let shareToken: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: `E2E Share Test ${Date.now()}` },
    });
    const project = await res.json();
    projectId = project.id;
    shareToken = project.share_token;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      await request.delete(`${API}/api/projects/${projectId}`);
    }
  });

  test('share page displays project name', async ({ page }) => {
    await page.goto(`/share/${shareToken}`);

    // Verify project name is displayed
    await expect(page.getByText('E2E Share Test', { exact: false })).toBeVisible();
  });

  test('share page has device size selector', async ({ page }) => {
    await page.goto(`/share/${shareToken}`);

    await expect(page.getByTestId('device-desktop')).toBeVisible();
    await expect(page.getByTestId('device-tablet')).toBeVisible();
    await expect(page.getByTestId('device-mobile')).toBeVisible();
  });

  test('share page shows preview area', async ({ page }) => {
    await page.goto(`/share/${shareToken}`);

    // The preview panel should exist - even without HTML it shows an empty state
    // When html is null, it shows the empty state message
    await expect(page.getByText('在對話面板中描述你的 UI 來生成原型')).toBeVisible();
  });

  test('invalid share token shows not found', async ({ page }) => {
    await page.goto('/share/invalid-token-xyz');

    await expect(page.getByText('找不到專案')).toBeVisible();
  });
});
