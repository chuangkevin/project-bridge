import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('E2E: Spec Panel', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: 'E2E Spec Panel Test' },
    });
    const project = await res.json();
    projectId = project.id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      await request.delete(`${API}/api/projects/${projectId}`);
    }
  });

  test('spec panel exists with Annotations and Spec tabs', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '設計' }).click();

    // The spec panel should be visible (not collapsed by default)
    await expect(page.getByTestId('tab-annotations')).toBeVisible();
    await expect(page.getByTestId('tab-spec')).toBeVisible();
  });

  test('can collapse and expand spec panel', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '設計' }).click();

    // Collapse the spec panel
    await page.getByTestId('spec-panel-collapse').click();

    // After collapsing, tabs should not be visible
    await expect(page.getByTestId('tab-annotations')).not.toBeVisible();

    // Expand button should appear
    await expect(page.getByTestId('spec-panel-expand')).toBeVisible();

    // Click expand
    await page.getByTestId('spec-panel-expand').click();

    // Tabs should be visible again
    await expect(page.getByTestId('tab-annotations')).toBeVisible();
    await expect(page.getByTestId('tab-spec')).toBeVisible();
  });

  test('switching between annotations and spec tabs works', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '設計' }).click();

    // Default tab is annotations - verify empty state message
    await expect(page.getByText('尚無標注。開啟標注模式來新增。')).toBeVisible();

    // Switch to Spec tab
    await page.getByTestId('tab-spec').click();

    // Verify spec empty state
    await expect(page.getByText('選取一個標注來查看其規格。')).toBeVisible();

    // Switch back to annotations tab
    await page.getByTestId('tab-annotations').click();
    await expect(page.getByText('尚無標注。開啟標注模式來新增。')).toBeVisible();
  });
});
