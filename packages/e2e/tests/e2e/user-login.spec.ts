import { test, expect } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_BASE_URL || 'http://localhost:3001';

/**
 * Task 13.6: Login flow + homepage section display
 *
 * Covers:
 *  - 13.6a: Setup flow (first user) — skipped if users already exist
 *  - 13.6b: Login flow via user card selection
 *  - 13.6c: Homepage sections (my projects vs others' projects)
 *  - 13.6d: Logout
 */

test.describe('E2E: User Login & Homepage Sections', () => {
  let adminToken: string;
  let adminUser: { id: string; name: string; role: string };
  let testUser: { id: string; name: string; role: string };
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  /**
   * Helper: ensure at least one admin exists and obtain an admin token.
   * If no users exist, create an admin via the setup endpoint.
   * Then create a regular test user for login tests.
   */
  test.beforeAll(async ({ request }) => {
    // 1. Check auth status
    const statusRes = await request.get(`${API}/api/auth/status`);
    const { hasUsers } = await statusRes.json();

    if (!hasUsers) {
      // Run setup to create the first admin
      const setupRes = await request.post(`${API}/api/auth/setup`, {
        data: { name: 'E2E Admin' },
      });
      expect(setupRes.ok()).toBeTruthy();
      const setupData = await setupRes.json();
      adminToken = setupData.token;
      adminUser = setupData.user;
    } else {
      // Find an existing admin user and login as them
      const usersRes = await request.get(`${API}/api/auth/users`);
      const users = await usersRes.json();
      const admin = users.find((u: any) => u.role === 'admin');
      expect(admin).toBeTruthy();

      const loginRes = await request.post(`${API}/api/auth/login`, {
        data: { userId: admin.id },
      });
      expect(loginRes.ok()).toBeTruthy();
      const loginData = await loginRes.json();
      adminToken = loginData.token;
      adminUser = loginData.user;
    }

    // 2. Create a regular test user via the admin API
    const createUserRes = await request.post(`${API}/api/users`, {
      data: { name: `E2E TestUser ${Date.now()}` },
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(createUserRes.ok()).toBeTruthy();
    const newUser = await createUserRes.json();
    testUser = { id: newUser.id, name: newUser.name, role: newUser.role };
    createdUserIds.push(newUser.id);
  });

  test.afterAll(async ({ request }) => {
    // Clean up projects
    for (const pid of createdProjectIds) {
      try {
        await request.delete(`${API}/api/projects/${pid}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
      } catch { /* ignore */ }
    }

    // Clean up test users (admin deletes them)
    for (const uid of createdUserIds) {
      try {
        await request.delete(`${API}/api/users/${uid}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
      } catch { /* ignore */ }
    }
  });

  // ── 13.6a: Setup flow ──────────────────────────────────────────────────

  test('13.6a: setup page redirects to /setup when no users exist', async ({ request }) => {
    // This test can only validate the concept: if users already exist, skip.
    const statusRes = await request.get(`${API}/api/auth/status`);
    const { hasUsers } = await statusRes.json();

    // We run beforeAll which guarantees users exist by now, so we skip the
    // interactive setup test — it cannot be safely run in a shared DB.
    test.skip(hasUsers, 'Users already exist; setup flow cannot be tested without a clean DB');
  });

  // ── 13.6b: Login flow ─────────────────────────────────────────────────

  test('13.6b: unauthenticated user is redirected to /login', async ({ page }) => {
    // Clear auth state
    await page.goto('/login');
    await page.evaluate(() => localStorage.removeItem('pb-auth-token'));

    await page.goto('/', { waitUntil: 'networkidle', timeout: 30000 });

    // Should redirect to login page
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('13.6b: login page shows user cards', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => localStorage.removeItem('pb-auth-token'));
    await page.goto('/login', { waitUntil: 'networkidle', timeout: 30000 });

    // The login page title
    await expect(page.getByText('選擇使用者登入')).toBeVisible();

    // Should display at least the admin and the test user
    await expect(page.getByText(adminUser.name)).toBeVisible();
    await expect(page.getByText(testUser.name)).toBeVisible();
  });

  test('13.6b: clicking user card logs in and redirects to /', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => localStorage.removeItem('pb-auth-token'));
    await page.goto('/login', { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for user list to load
    await expect(page.getByText(testUser.name)).toBeVisible();

    // Click on the test user button to login
    await page.getByText(testUser.name).click();

    // Should redirect to homepage
    await expect(page).toHaveURL(/^\/$|\/$/,  { timeout: 10000 });

    // Homepage should show user name in header
    await expect(page.getByText(testUser.name)).toBeVisible();

    // Verify the auth token was stored in localStorage
    const token = await page.evaluate(() => localStorage.getItem('pb-auth-token'));
    expect(token).toBeTruthy();
  });

  // ── 13.6c: Homepage sections ──────────────────────────────────────────

  test('13.6c: homepage shows "my projects" and "others projects" sections', async ({ page, request }) => {
    // 1. Login as test user via API and get token
    const loginRes = await request.post(`${API}/api/auth/login`, {
      data: { userId: testUser.id },
    });
    const { token: userToken } = await loginRes.json();

    // 2. Create a project owned by the test user
    const myProjectRes = await request.post(`${API}/api/projects`, {
      data: { name: 'E2E MyProject' },
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const myProject = await myProjectRes.json();
    createdProjectIds.push(myProject.id);

    // 3. Create a project owned by admin (will be "other's project" for test user)
    const otherProjectRes = await request.post(`${API}/api/projects`, {
      data: { name: 'E2E AdminProject' },
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const otherProject = await otherProjectRes.json();
    createdProjectIds.push(otherProject.id);

    // 4. Login as test user in the browser
    await page.goto('/login');
    await page.evaluate(() => localStorage.removeItem('pb-auth-token'));
    await page.goto('/login', { waitUntil: 'networkidle', timeout: 30000 });
    await expect(page.getByText(testUser.name)).toBeVisible();
    await page.getByText(testUser.name).click();
    await expect(page).toHaveURL(/^\/$|\/$/,  { timeout: 10000 });

    // 5. Verify "My Projects" section
    await expect(page.getByText('我的專案')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('E2E MyProject')).toBeVisible();

    // 6. Verify "Others' Projects" section
    await expect(page.getByText('其他人的專案')).toBeVisible();
    await expect(page.getByText('E2E AdminProject')).toBeVisible();

    // 7. Others' projects should show owner name
    const otherCard = page.getByTestId(`project-card-${otherProject.id}`);
    await expect(otherCard).toBeVisible();
    await expect(otherCard.getByText(`by ${adminUser.name}`)).toBeVisible();

    // 8. Others' projects should have fork button
    await expect(page.getByTestId(`fork-project-${otherProject.id}`)).toBeVisible();

    // 9. Own projects should have delete button
    await expect(page.getByTestId(`delete-project-${myProject.id}`)).toBeVisible();
  });

  // ── 13.6d: Logout ─────────────────────────────────────────────────────

  test('13.6d: logout clears token and redirects to /login', async ({ page }) => {
    // Login as test user via the UI
    await page.goto('/login');
    await page.evaluate(() => localStorage.removeItem('pb-auth-token'));
    await page.goto('/login', { waitUntil: 'networkidle', timeout: 30000 });
    await expect(page.getByText(testUser.name)).toBeVisible();
    await page.getByText(testUser.name).click();
    await expect(page).toHaveURL(/^\/$|\/$/,  { timeout: 10000 });

    // Verify we are logged in
    const tokenBefore = await page.evaluate(() => localStorage.getItem('pb-auth-token'));
    expect(tokenBefore).toBeTruthy();

    // Click logout button
    await page.getByTestId('logout-btn').click();

    // Should redirect to /login
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });

    // Token should be cleared from localStorage
    const tokenAfter = await page.evaluate(() => localStorage.getItem('pb-auth-token'));
    expect(tokenAfter).toBeNull();
  });
});
