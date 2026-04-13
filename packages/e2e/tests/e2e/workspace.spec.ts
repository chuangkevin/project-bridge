import { test, expect } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_BASE_URL || 'http://localhost:3001';

test.describe('E2E: Workspace', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: `E2E Workspace Test ${Date.now()}` },
    });
    const project = await res.json();
    projectId = project.id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      await request.delete(`${API}/api/projects/${projectId}`);
    }
  });

  test('workspace page loads with chat panel, preview area, and toolbar', async ({ page }) => {
    await page.goto(`/project/${projectId}`);

    // Verify toolbar is visible (wait for loading to finish)
    await expect(page.getByText('E2E Workspace Test', { exact: false })).toBeVisible();

    // Verify chat panel header
    await expect(page.getByRole('heading', { name: 'Chat' })).toBeVisible();

    // Verify chat input area
    await expect(page.getByPlaceholder('Describe your UI...')).toBeVisible();

    // Verify preview area (empty state text)
    await expect(page.getByText('Describe your UI in the chat panel', { exact: false })).toBeVisible();

    // Verify device size selector buttons
    await expect(page.getByTestId('device-desktop')).toBeVisible();
    await expect(page.getByTestId('device-tablet')).toBeVisible();
    await expect(page.getByTestId('device-mobile')).toBeVisible();

    // Verify share button
    await expect(page.getByTestId('share-btn')).toBeVisible();
  });

  test('can type a message in chat input and send it', async ({ page }) => {
    await page.goto(`/project/${projectId}`);

    // Wait for workspace to load
    await expect(page.getByPlaceholder('Describe your UI...')).toBeVisible();

    // Type a message
    const chatInput = page.getByPlaceholder('Describe your UI...');
    await chatInput.fill('Create a simple button');

    // Click send button
    await page.getByTestId('send-btn').click();

    // Verify the user message appears in the chat
    await expect(page.getByText('Create a simple button')).toBeVisible({ timeout: 5000 });

    // The request will either start streaming (if API key set) or show an error
    // Either way the UI should handle it gracefully without crashing
    // Wait a moment for the response to arrive
    await page.waitForTimeout(2000);

    // Page should still be functional - input should be visible
    await expect(chatInput).toBeVisible();
  });

  test('home button navigates back to home page', async ({ page }) => {
    await page.goto(`/project/${projectId}`);

    // Wait for workspace to load
    await expect(page.getByTestId('home-btn')).toBeVisible();

    await page.getByTestId('home-btn').click();
    await expect(page).toHaveURL('/');
    await expect(page.locator('h1')).toContainText('Project Bridge');
  });
});
