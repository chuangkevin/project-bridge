import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('E2E: Smoke Test — Full Flow', () => {
  const createdProjectIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdProjectIds) {
      try {
        await request.delete(`${API}/api/projects/${id}`);
      } catch {
        // ignore cleanup errors
      }
    }
    createdProjectIds.length = 0;
  });

  test('full flow: create project, workspace, send message, share', async ({ page, request }) => {
    // Step 1: Navigate to home page
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Project Bridge');

    // Step 2: Create a new project
    await page.getByTestId('new-project-btn').click();
    await expect(page.getByText('Project Name')).toBeVisible();
    await page.getByPlaceholder('My awesome prototype').fill('E2E Smoke Test Project');
    await page.getByTestId('create-project-btn').click();

    // Step 3: Verify redirect to workspace
    await expect(page).toHaveURL(/\/project\/[\w-]+/, { timeout: 10000 });

    // Extract project ID from URL for cleanup
    const url = page.url();
    const idMatch = url.match(/\/project\/([\w-]+)/);
    if (idMatch) {
      createdProjectIds.push(idMatch[1]);
    }

    // Step 4: Verify workspace loaded
    await expect(page.getByText('E2E Smoke Test Project')).toBeVisible();
    await expect(page.getByPlaceholder('Describe your UI...')).toBeVisible();

    // Step 5: Send a message in chat
    const chatInput = page.getByPlaceholder('Describe your UI...');
    await chatInput.fill('Create a simple hello world page');
    await page.getByTestId('send-btn').click();

    // Step 6: Verify user message appears
    await expect(page.getByText('Create a simple hello world page')).toBeVisible({ timeout: 5000 });

    // Wait for response/error to be processed
    await page.waitForTimeout(3000);

    // Step 7: Click share button and verify the share URL format
    await page.getByTestId('share-btn').click();

    // Should see "Link copied!" toast
    await expect(page.getByText('Link copied!')).toBeVisible({ timeout: 5000 });

    // Step 8: Verify the share page works by navigating to it
    // Get the share token via API
    if (idMatch) {
      const projRes = await request.get(`${API}/api/projects/${idMatch[1]}`);
      const projData = await projRes.json();
      const shareToken = projData.share_token;

      await page.goto(`/share/${shareToken}`);
      await expect(page.getByText('E2E Smoke Test Project')).toBeVisible();
    }
  });
});
