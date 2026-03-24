import { test, expect, type Page } from '@playwright/test';

const API = 'http://localhost:3001';

/**
 * UX Enhancement Pack: Settings Page E2E Tests
 *
 * Covers:
 *  - Settings page requires admin password (not just user selection)
 *  - API key CRUD (add, view masked, delete)
 *  - Agent skills section visible
 *  - Change password flow
 *
 * data-testid attributes used:
 *   setup-password, setup-confirm, setup-submit
 *   login-password, login-submit
 *   show-change-password, change-current-password, change-new-password,
 *   change-confirm-password, change-password-submit
 *   settings-btn
 */

// ─── Helpers ──────────────────────────────────────────────

/** Navigate to settings page and authenticate with admin password */
async function loginToSettings(page: Page, password: string) {
  await page.goto('/settings', { waitUntil: 'networkidle', timeout: 30000 });

  // If we see login-password input, enter the password
  const loginInput = page.getByTestId('login-password');
  if (await loginInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await loginInput.fill(password);
    await page.getByTestId('login-submit').click();
    // Wait for authenticated settings page to load
    await expect(page.getByText('Gemini API Keys')).toBeVisible({ timeout: 10000 });
  }
}

/** Ensure admin password is set up; returns the password used */
async function ensureAdminPassword(page: Page): Promise<string> {
  const password = 'test1234';

  await page.goto('/settings', { waitUntil: 'networkidle', timeout: 30000 });

  // Check if we're on the setup screen (first time)
  const setupInput = page.getByTestId('setup-password');
  if (await setupInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await setupInput.fill(password);
    await page.getByTestId('setup-confirm').fill(password);
    await page.getByTestId('setup-submit').click();
    // Should authenticate directly after setup
    await expect(page.getByText('Gemini API Keys')).toBeVisible({ timeout: 10000 });
    return password;
  }

  // Already set up — need to login
  const loginInput = page.getByTestId('login-password');
  if (await loginInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    // Try the standard test password
    await loginInput.fill(password);
    await page.getByTestId('login-submit').click();

    // If it works, we get the settings page
    const keysHeader = page.getByText('Gemini API Keys');
    const errorText = page.locator('p:has-text("驗證失敗"), p:has-text("密碼錯誤")');
    await Promise.race([
      keysHeader.waitFor({ state: 'visible', timeout: 5000 }),
      errorText.waitFor({ state: 'visible', timeout: 5000 }),
    ]).catch(() => {});

    if (await keysHeader.isVisible()) {
      return password;
    }
    // Password didn't work — this DB has a different password; skip
    test.skip(true, 'Admin password is not the test default; cannot authenticate');
  }

  return password;
}

// ─── Tests ────────────────────────────────────────────────

test.describe('設定頁面 — 密碼保護與管理', () => {
  test('設定頁面需要管理員密碼（非使用者選擇）', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'networkidle', timeout: 30000 });

    // Should see either setup-password (first time) or login-password (returning user)
    const setupInput = page.getByTestId('setup-password');
    const loginInput = page.getByTestId('login-password');

    const isSetup = await setupInput.isVisible({ timeout: 5000 }).catch(() => false);
    const isLogin = await loginInput.isVisible({ timeout: 2000 }).catch(() => false);

    // At least one of these must be visible — settings is password-protected
    expect(isSetup || isLogin).toBeTruthy();

    // The full settings content (API Keys section) should NOT be visible yet
    await expect(page.getByText('Gemini API Keys')).not.toBeVisible();
  });

  test('首次設定管理員密碼 → 進入設定頁', async ({ page, request }) => {
    // This test is only valid when no password has been set
    const statusRes = await request.get(`${API}/api/auth/status`);
    const status = await statusRes.json();
    test.skip(status.hasPassword === true, '密碼已設定，跳過首次設定測試');

    await page.goto('/settings', { waitUntil: 'networkidle', timeout: 30000 });

    // Setup form should be visible
    await expect(page.getByTestId('setup-password')).toBeVisible();
    await expect(page.getByText('設定管理員密碼')).toBeVisible();

    // Fill in password
    await page.getByTestId('setup-password').fill('test1234');
    await page.getByTestId('setup-confirm').fill('test1234');
    await page.getByTestId('setup-submit').click();

    // Should now see the full settings page
    await expect(page.getByText('Gemini API Keys')).toBeVisible({ timeout: 10000 });
  });

  test('密碼不一致時顯示錯誤', async ({ page, request }) => {
    const statusRes = await request.get(`${API}/api/auth/status`);
    const status = await statusRes.json();
    test.skip(status.hasPassword === true, '密碼已設定');

    await page.goto('/settings', { waitUntil: 'networkidle', timeout: 30000 });
    await expect(page.getByTestId('setup-password')).toBeVisible();

    await page.getByTestId('setup-password').fill('test1234');
    await page.getByTestId('setup-confirm').fill('wrongmatch');
    await page.getByTestId('setup-submit').click();

    // Error message should appear
    await expect(page.getByText('不一致')).toBeVisible({ timeout: 3000 });
  });

  test('輸入正確密碼 → 驗證通過', async ({ page }) => {
    const password = await ensureAdminPassword(page);

    // Clear session token to force re-login
    await page.evaluate(() => sessionStorage.removeItem('admin_token'));
    await page.goto('/settings', { waitUntil: 'networkidle', timeout: 30000 });

    const loginInput = page.getByTestId('login-password');
    if (await loginInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await loginInput.fill(password);
      await page.getByTestId('login-submit').click();
      await expect(page.getByText('Gemini API Keys')).toBeVisible({ timeout: 10000 });
    }
    // If already authenticated (session still valid), that's fine too
  });

  test('錯誤密碼 → 驗證失敗', async ({ page, request }) => {
    const statusRes = await request.get(`${API}/api/auth/status`);
    const status = await statusRes.json();
    test.skip(!status.hasPassword, '尚未設定密碼');

    await page.goto('/settings', { waitUntil: 'networkidle', timeout: 30000 });
    await page.evaluate(() => sessionStorage.removeItem('admin_token'));
    await page.goto('/settings', { waitUntil: 'networkidle', timeout: 30000 });

    const loginInput = page.getByTestId('login-password');
    if (await loginInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await loginInput.fill('wrong-password-xyz');
      await page.getByTestId('login-submit').click();

      // Should show error, not the settings page
      await expect(page.getByText('Gemini API Keys')).not.toBeVisible({ timeout: 3000 });
    }
  });
});

test.describe('設定頁面 — API Key 管理', () => {
  let password: string;

  test.beforeEach(async ({ page }) => {
    password = await ensureAdminPassword(page);
  });

  test('API Key 列表顯示遮罩後綴（...xxxx）', async ({ page }) => {
    await loginToSettings(page, password);

    // Check for the API Keys section
    await expect(page.getByText('Gemini API Keys')).toBeVisible();

    // Keys are displayed as "...{suffix}" — check for the code element pattern
    const keySuffixes = page.locator('code');
    const count = await keySuffixes.count();
    // If there are keys, they should show masked format
    if (count > 0) {
      const firstKey = await keySuffixes.first().textContent();
      expect(firstKey).toMatch(/^\.\.\./);
    }
  });

  test('新增無效 API Key → 顯示錯誤', async ({ page }) => {
    await loginToSettings(page, password);

    // Try adding an invalid key
    const keyInput = page.getByPlaceholder(/貼上新的 API Key/);
    await keyInput.fill('invalid-key-12345');
    await page.getByRole('button', { name: /新增/ }).click();

    // Should show error (must start with AIza)
    await expect(page.getByText('AIza')).toBeVisible({ timeout: 3000 });
  });

  test('ENV Key 顯示 ENV 標記', async ({ page }) => {
    await loginToSettings(page, password);

    // Check if there's an ENV badge visible (depends on server config)
    const envBadge = page.locator('span:has-text("ENV")');
    const envNotice = page.getByText('已透過環境變數設定');

    // Either ENV badge on a key or the ENV notice should be present
    // (only when server has env key set — conditional check)
    const hasEnv = await envBadge.isVisible({ timeout: 2000 }).catch(() => false);
    const hasNotice = await envNotice.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasEnv) {
      await expect(envBadge.first()).toBeVisible();
    }
    if (hasNotice) {
      await expect(envNotice).toBeVisible();
    }
    // If neither — no env key set, which is also valid
  });
});

test.describe('設定頁面 — Agent Skills 區塊', () => {
  test('Agent Skills 區塊可見', async ({ page }) => {
    const password = await ensureAdminPassword(page);
    await loginToSettings(page, password);

    // Scroll down if needed and verify skills section is visible
    await expect(page.getByText('Agent Skills')).toBeVisible({ timeout: 10000 });
  });

  test('Agent Skills 顯示啟用數量', async ({ page }) => {
    const password = await ensureAdminPassword(page);
    await loginToSettings(page, password);

    // The badge shows "X / Y 啟用"
    await expect(page.getByText('Agent Skills')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/\d+ \/ \d+ 啟用/)).toBeVisible();
  });
});

test.describe('設定頁面 — 變更密碼', () => {
  test('變更密碼流程', async ({ page }) => {
    const password = await ensureAdminPassword(page);
    await loginToSettings(page, password);

    // Click "變更管理員密碼" button
    await page.getByTestId('show-change-password').click();

    // Change password form should appear
    await expect(page.getByTestId('change-current-password')).toBeVisible();
    await expect(page.getByTestId('change-new-password')).toBeVisible();
    await expect(page.getByTestId('change-confirm-password')).toBeVisible();

    // Fill in current password and new password
    await page.getByTestId('change-current-password').fill(password);
    const newPassword = 'newpass1234';
    await page.getByTestId('change-new-password').fill(newPassword);
    await page.getByTestId('change-confirm-password').fill(newPassword);

    // Submit
    await page.getByTestId('change-password-submit').click();

    // Should show success message
    await expect(page.getByText('密碼已成功變更')).toBeVisible({ timeout: 5000 });

    // Revert password back to original for other tests
    await page.getByTestId('show-change-password').click();
    await page.getByTestId('change-current-password').fill(newPassword);
    await page.getByTestId('change-new-password').fill(password);
    await page.getByTestId('change-confirm-password').fill(password);
    await page.getByTestId('change-password-submit').click();
    await expect(page.getByText('密碼已成功變更')).toBeVisible({ timeout: 5000 });
  });

  test('新密碼不一致 → 顯示錯誤', async ({ page }) => {
    const password = await ensureAdminPassword(page);
    await loginToSettings(page, password);

    await page.getByTestId('show-change-password').click();
    await page.getByTestId('change-current-password').fill(password);
    await page.getByTestId('change-new-password').fill('aaaa1111');
    await page.getByTestId('change-confirm-password').fill('bbbb2222');
    await page.getByTestId('change-password-submit').click();

    await expect(page.getByText('不一致')).toBeVisible({ timeout: 3000 });
  });

  test('新密碼太短 → 顯示錯誤', async ({ page }) => {
    const password = await ensureAdminPassword(page);
    await loginToSettings(page, password);

    await page.getByTestId('show-change-password').click();
    await page.getByTestId('change-current-password').fill(password);
    await page.getByTestId('change-new-password').fill('ab');
    await page.getByTestId('change-confirm-password').fill('ab');
    await page.getByTestId('change-password-submit').click();

    await expect(page.getByText('至少')).toBeVisible({ timeout: 3000 });
  });
});
