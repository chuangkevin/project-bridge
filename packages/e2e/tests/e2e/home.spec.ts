import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('E2E: Home Page', () => {
  test.afterEach(async ({ request }) => {
    // Clean up any projects that might remain
    const res = await request.get(`${API}/api/projects`);
    if (res.ok()) {
      const projects = await res.json();
      for (const p of projects) {
        if (p.name.startsWith('E2E Home Test')) {
          await request.delete(`${API}/api/projects/${p.id}`);
        }
      }
    }
  });

  test('navigates to / and verifies home page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Project Bridge');
    await expect(page.getByTestId('new-project-btn')).toBeVisible();
  });

  test('creates a project via New Project button', async ({ page }) => {
    await page.goto('/');

    // Click New Project button
    await page.getByTestId('new-project-btn').click();

    // Fill in project name in the dialog
    await expect(page.getByText('專案名稱')).toBeVisible();
    await page.getByPlaceholder('我的原型專案').fill('E2E Home Test Project');

    // Submit the form
    await page.getByTestId('create-project-btn').click();

    // Verify redirect to workspace
    await expect(page).toHaveURL(/\/project\/[\w-]+/, { timeout: 10000 });

    // Verify we're on the workspace page (project list button visible in top bar)
    await expect(page.getByRole('button', { name: '專案列表' })).toBeVisible();
  });

  test('project card appears on home page after creation', async ({ page, request }) => {
    // Create project via API
    const createRes = await request.post(`${API}/api/projects`, {
      data: { name: 'E2E Home Test Card' },
    });
    const project = await createRes.json();

    await page.goto('/');

    // Verify project card appears
    await expect(page.getByText('E2E Home Test Card')).toBeVisible();

    // Clean up
    await request.delete(`${API}/api/projects/${project.id}`);
  });

  test('deletes a project and it disappears', async ({ page, request }) => {
    // Create project via API
    const createRes = await request.post(`${API}/api/projects`, {
      data: { name: 'E2E Home Test Delete' },
    });
    const project = await createRes.json();

    await page.goto('/');
    await expect(page.getByText('E2E Home Test Delete')).toBeVisible();

    // Set up dialog handler to auto-confirm
    page.on('dialog', dialog => dialog.accept());

    // Click the delete button using data-testid
    await page.getByTestId(`delete-project-${project.id}`).click();

    // Verify project disappears
    await expect(page.getByText('E2E Home Test Delete')).not.toBeVisible({ timeout: 5000 });
  });
});
