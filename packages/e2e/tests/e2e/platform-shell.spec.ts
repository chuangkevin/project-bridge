import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('E2E: Platform Shell — DesignPanel', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: `Platform Shell E2E ${Date.now()}` },
    });
    const project = await res.json();
    projectId = project.id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) await request.delete(`${API}/api/projects/${projectId}`);
  });

  test('DesignPanel shows Platform Shell section with extract button', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '設計' }).click();
    await page.getByTestId('tab-design').click();

    await expect(page.getByTestId('extract-shell-btn')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('平台 Shell')).toBeVisible();
  });

  test('shell-active-badge not visible before shell is set', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '設計' }).click();
    await page.getByTestId('tab-design').click();

    await expect(page.getByTestId('extract-shell-btn')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('shell-active-badge')).not.toBeVisible();
  });

  test('save shell manually via textarea shows success toast and badge appears', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '設計' }).click();
    await page.getByTestId('tab-design').click();

    // Open manual input
    await page.getByText('手動貼上 Shell').click();
    await expect(page.getByTestId('shell-html-textarea')).toBeVisible({ timeout: 3000 });

    // Fill textarea with shell HTML
    const shellHtml = '<nav>My Nav</nav><main>{CONTENT}</main>';
    await page.getByTestId('shell-html-textarea').fill(shellHtml);

    // Save
    await page.getByTestId('save-shell-btn').click();
    await expect(page.getByText('Platform Shell 已儲存')).toBeVisible({ timeout: 5000 });

    // Badge should appear
    await expect(page.getByTestId('shell-active-badge')).toBeVisible({ timeout: 3000 });
  });

  test('shell active badge visible on reload after saving via API', async ({ page, request }) => {
    // Seed shell via API
    await request.put(`${API}/api/projects/${projectId}/platform-shell`, {
      data: { shellHtml: '<nav>Nav</nav><main>{CONTENT}</main>' },
    });

    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '設計' }).click();
    await page.getByTestId('tab-design').click();

    await expect(page.getByTestId('shell-active-badge')).toBeVisible({ timeout: 5000 });
  });

  test('extract-shell-btn shows error toast when no prototype exists', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '設計' }).click();
    await page.getByTestId('tab-design').click();

    await expect(page.getByTestId('extract-shell-btn')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('extract-shell-btn').click();

    // Should show an error toast since no prototype exists
    await expect(page.getByText('No prototype version found').or(page.getByText('擷取失敗'))).toBeVisible({ timeout: 5000 });
  });
});
