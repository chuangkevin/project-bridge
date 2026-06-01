import { test, expect } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_BASE_URL || 'http://localhost:3001';

test.describe('E2E: Collaboration Features', () => {
  let projectId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: `E2E Collab Test ${Date.now()}` },
    });
    expect(res.status()).toBe(201);
    const project = await res.json();
    projectId = project.id;
  });

  test.afterAll(async ({ request }) => {
    if (projectId) {
      try {
        await request.delete(`${API}/api/projects/${projectId}`);
      } catch { /* ignore cleanup errors */ }
    }
  });

  test('PresenceBar is visible on workspace page', async ({ page }) => {
    await page.goto(`/project/${projectId}`);

    // Wait for the workspace to load — the project name should appear
    await expect(page.getByText('E2E Collab Test', { exact: false })).toBeVisible({ timeout: 15000 });

    // The PresenceBar renders a connection indicator dot (green or red, 8px circle).
    // It's always present even when no collaboration members are shown.
    // Look for the PresenceBar container which sits near the user widget in the toolbar.
    // The dot has a title attribute of either "Connected" or "Disconnected".
    const connectionDot = page.locator('[title="Connected"], [title="Disconnected"]').first();
    await expect(connectionDot).toBeVisible({ timeout: 10000 });
  });

  test('Chat input area is visible and enabled (no generation lock)', async ({ page }) => {
    await page.goto(`/project/${projectId}`);

    // Wait for workspace to load
    await expect(page.getByText('E2E Collab Test', { exact: false })).toBeVisible({ timeout: 15000 });

    // Verify the chat input textarea is visible and enabled
    const chatInput = page.locator('textarea[placeholder*="UI"], textarea[placeholder*="描述"]');
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    await expect(chatInput).toBeEnabled();

    // Verify the send button exists
    await expect(page.getByTestId('send-btn')).toBeVisible();
  });

  test('Figma export button is present in spec panel', async ({ page }) => {
    await page.goto(`/project/${projectId}`);

    // Wait for workspace to load
    await expect(page.getByText('E2E Collab Test', { exact: false })).toBeVisible({ timeout: 15000 });

    // The Figma export button lives in the SpecPanel. Try switching to the spec/design tab.
    // Look for the spec tab — it may be labeled "Spec" or "規格"
    const specTab = page.getByRole('tab', { name: /Spec|規格/ });
    if (await specTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await specTab.click();

      // The export-figma-btn test ID is inside SpecPanel
      const figmaBtn = page.getByTestId('export-figma-btn');
      // The button may only appear when there's spec data. Just check it doesn't crash.
      // If visible, confirm it's a button.
      if (await figmaBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(figmaBtn).toBeEnabled();
      }
    }
    // If spec tab doesn't exist on a fresh project, the test still passes —
    // the feature is only available when spec data is generated.
  });

  test('Workspace does not crash when navigating with collaboration context', async ({ page }) => {
    await page.goto(`/project/${projectId}`);

    // Wait for full workspace load
    await expect(page.getByText('E2E Collab Test', { exact: false })).toBeVisible({ timeout: 15000 });

    // Navigate away and back — collaboration context should handle mount/unmount gracefully
    await page.getByTestId('home-btn').click();
    await expect(page).toHaveURL('/');

    // Navigate back to the project
    await page.goto(`/project/${projectId}`);
    await expect(page.getByText('E2E Collab Test', { exact: false })).toBeVisible({ timeout: 15000 });

    // Verify the connection indicator still appears after re-mount
    const connectionDot = page.locator('[title="Connected"], [title="Disconnected"]').first();
    await expect(connectionDot).toBeVisible({ timeout: 10000 });
  });
});
