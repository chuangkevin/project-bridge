import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

/**
 * Helper: set auth token in localStorage and navigate to a page.
 */
async function loginAs(page: import('@playwright/test').Page, token: string, path = '/') {
  await page.goto('/');
  await page.evaluate((t) => localStorage.setItem('pb-auth-token', t), token);
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

test.describe('13.7 & 13.8: Non-owner restrictions, Fork, Admin user management', () => {
  let adminToken: string;
  let adminUserId: string;
  let testUserToken: string;
  let testUserId: string;
  let adminProjectId: string;
  const cleanupUserIds: string[] = [];
  const cleanupProjectIds: string[] = [];

  test.beforeAll(async ({ request }) => {
    // 1. Check auth status, create admin if needed or login as existing admin
    const statusRes = await request.get(`${API}/api/auth/status`);
    const status = await statusRes.json();

    if (!status.hasUsers) {
      // No users exist — run setup to create admin
      const setupRes = await request.post(`${API}/api/auth/setup`, {
        data: { name: `E2E_Admin_${Date.now()}` },
      });
      expect(setupRes.ok()).toBeTruthy();
      const setupData = await setupRes.json();
      adminToken = setupData.token;
      adminUserId = setupData.user.id;
    } else {
      // Users exist — list active users, find admin, login
      const usersRes = await request.get(`${API}/api/auth/users`);
      const users = await usersRes.json();
      const admin = users.find((u: any) => u.role === 'admin');
      expect(admin).toBeTruthy();
      adminUserId = admin.id;

      const loginRes = await request.post(`${API}/api/auth/login`, {
        data: { userId: adminUserId },
      });
      expect(loginRes.ok()).toBeTruthy();
      const loginData = await loginRes.json();
      adminToken = loginData.token;
    }

    // 2. Create a test user via admin API
    const createUserRes = await request.post(`${API}/api/users`, {
      data: { name: `E2E_TestUser_${Date.now()}` },
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(createUserRes.ok()).toBeTruthy();
    const testUser = await createUserRes.json();
    testUserId = testUser.id;
    cleanupUserIds.push(testUserId);

    // 3. Login as test user to get their token
    const testLoginRes = await request.post(`${API}/api/auth/login`, {
      data: { userId: testUserId },
    });
    expect(testLoginRes.ok()).toBeTruthy();
    const testLoginData = await testLoginRes.json();
    testUserToken = testLoginData.token;

    // 4. Create a project owned by admin (for fork testing)
    const projectRes = await request.post(`${API}/api/projects`, {
      data: { name: `E2E_AdminProject_${Date.now()}` },
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(projectRes.ok()).toBeTruthy();
    const project = await projectRes.json();
    adminProjectId = project.id;
    cleanupProjectIds.push(adminProjectId);
  });

  test.afterAll(async ({ request }) => {
    // Clean up projects
    for (const pid of cleanupProjectIds) {
      try {
        await request.delete(`${API}/api/projects/${pid}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
      } catch { /* ignore */ }
    }

    // Clean up test users
    for (const uid of cleanupUserIds) {
      try {
        await request.delete(`${API}/api/users/${uid}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
      } catch { /* ignore */ }
    }
  });

  // ─── 13.7: Non-owner restrictions + Fork ──────────────────────

  test('13.7a: non-owner sees read-only workspace with fork button', async ({ page }) => {
    // Login as test user and navigate to admin's project
    await loginAs(page, testUserToken, `/project/${adminProjectId}`);

    // The workspace should load — verify project-related content is visible
    await expect(page.getByTestId('user-name')).toBeVisible({ timeout: 15000 });

    // Fork button should be visible (only shown for non-owners)
    await expect(page.getByTestId('fork-btn')).toBeVisible();

    // Visual edit toggle should be disabled (readOnly)
    const editBtn = page.getByTestId('visual-edit-toggle');
    if (await editBtn.isVisible()) {
      await expect(editBtn).toBeDisabled();
    }
  });

  test('13.7b: fork creates a copy owned by the test user', async ({ page }) => {
    // Login as test user and navigate to admin's project
    await loginAs(page, testUserToken, `/project/${adminProjectId}`);

    // Wait for workspace to load
    await expect(page.getByTestId('fork-btn')).toBeVisible({ timeout: 15000 });

    // Click fork button
    await page.getByTestId('fork-btn').click();

    // Should redirect to the forked project
    await expect(page).toHaveURL(/\/project\/[\w-]+/, { timeout: 10000 });

    // The new URL should be different from the admin project
    const newUrl = page.url();
    const forkedIdMatch = newUrl.match(/\/project\/([\w-]+)/);
    expect(forkedIdMatch).toBeTruthy();
    const forkedId = forkedIdMatch![1];
    expect(forkedId).not.toBe(adminProjectId);
    cleanupProjectIds.push(forkedId);

    // Fork button should NOT be visible (user now owns the forked project)
    await expect(page.getByTestId('fork-btn')).not.toBeVisible({ timeout: 5000 });
  });

  // ─── 13.8: Admin user management panel ────────────────────────

  test('13.8a: admin sees user management section on settings page', async ({ page }) => {
    await loginAs(page, adminToken, '/settings');

    // Should see the "使用者管理" section
    await expect(page.getByText('使用者管理')).toBeVisible({ timeout: 10000 });

    // Should see table headers for user info
    await expect(page.getByText('名稱')).toBeVisible();
    await expect(page.getByText('角色')).toBeVisible();
    await expect(page.getByText('狀態')).toBeVisible();
  });

  test('13.8b: admin adds a new user', async ({ page }) => {
    await loginAs(page, adminToken, '/settings');

    // Wait for user management section
    await expect(page.getByText('使用者管理')).toBeVisible({ timeout: 10000 });

    const uniqueName = `E2E_NewUser_${Date.now()}`;

    // Fill in the add user input
    await page.getByPlaceholder('輸入新使用者名稱').fill(uniqueName);

    // Click add button
    await page.getByRole('button', { name: '新增使用者' }).click();

    // New user should appear in the table
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 5000 });

    // Track for cleanup — we need to get the user ID from the API
    const usersRes = await page.request.get(`${API}/api/users/all`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const allUsers = await usersRes.json();
    const newUser = allUsers.find((u: any) => u.name === uniqueName);
    if (newUser) cleanupUserIds.push(newUser.id);
  });

  test('13.8c: admin disables a user', async ({ page }) => {
    // Create a user specifically for this test
    const disableName = `E2E_Disable_${Date.now()}`;
    const createRes = await page.request.post(`${API}/api/users`, {
      data: { name: disableName },
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    });
    const created = await createRes.json();
    cleanupUserIds.push(created.id);

    await loginAs(page, adminToken, '/settings');
    await expect(page.getByText('使用者管理')).toBeVisible({ timeout: 10000 });

    // Find the row containing the user name, then click the disable button within it
    const userRow = page.locator('tr', { hasText: disableName });
    await expect(userRow).toBeVisible({ timeout: 5000 });

    // Click the "停用" button in that row
    await userRow.getByRole('button', { name: '停用' }).click();

    // User status should change to 停用
    await expect(userRow.getByText('停用')).toBeVisible({ timeout: 5000 });
  });

  test('13.8d: admin enables a disabled user', async ({ page }) => {
    // Create and disable a user via API
    const enableName = `E2E_Enable_${Date.now()}`;
    const createRes = await page.request.post(`${API}/api/users`, {
      data: { name: enableName },
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    });
    const created = await createRes.json();
    cleanupUserIds.push(created.id);

    // Disable the user via API
    await page.request.patch(`${API}/api/users/${created.id}/disable`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    await loginAs(page, adminToken, '/settings');
    await expect(page.getByText('使用者管理')).toBeVisible({ timeout: 10000 });

    const userRow = page.locator('tr', { hasText: enableName });
    await expect(userRow).toBeVisible({ timeout: 5000 });

    // Click the "啟用" button in that row
    await userRow.getByRole('button', { name: '啟用' }).click();

    // User status should change back to 啟用
    await expect(userRow.getByText('啟用')).toBeVisible({ timeout: 5000 });
  });

  test('13.8e: admin deletes a user with DestructiveConfirmDialog', async ({ page }) => {
    // Create a user specifically for deletion
    const deleteName = `E2E_Delete_${Date.now()}`;
    const createRes = await page.request.post(`${API}/api/users`, {
      data: { name: deleteName },
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    });
    expect(createRes.ok()).toBeTruthy();

    await loginAs(page, adminToken, '/settings');
    await expect(page.getByText('使用者管理')).toBeVisible({ timeout: 10000 });

    // Verify user appears
    const userRow = page.locator('tr', { hasText: deleteName });
    await expect(userRow).toBeVisible({ timeout: 5000 });

    // Click delete button (the SVG trash icon button) in the user row
    await userRow.getByTitle('刪除使用者').click();

    // DestructiveConfirmDialog should appear
    await expect(page.getByTestId('destructive-input')).toBeVisible({ timeout: 5000 });

    // Type the user's name in the confirmation input
    await page.getByTestId('destructive-input').fill(deleteName);

    // Click confirm button
    await page.getByTestId('destructive-confirm').click();

    // User should be removed from the table
    await expect(page.getByText(deleteName)).not.toBeVisible({ timeout: 5000 });
  });
});
