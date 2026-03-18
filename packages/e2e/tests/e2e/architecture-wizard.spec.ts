import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('Architecture Mode', () => {
  let projectId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, { data: { name: 'Arch UI Test' } });
    projectId = (await res.json()).id;
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`${API}/api/projects/${projectId}`);
  });

  test('Architecture tab is visible in project page', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await expect(page.getByRole('tab', { name: 'Architecture' })).toBeVisible();
  });

  test('Clicking Architecture tab shows arch content', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: 'Architecture' }).click();
    await expect(page.getByTestId('arch-wizard')).toBeVisible();
  });

  test('New project defaults to Architecture tab', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    // New project with no arch_data → should default to architecture mode
    const archTab = page.getByRole('tab', { name: 'Architecture' });
    await expect(archTab).toBeVisible();
    await expect(page.getByTestId('arch-wizard')).toBeVisible();
  });
});
