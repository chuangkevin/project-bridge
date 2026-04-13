import { test, expect, type Page } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_BASE_URL || 'http://localhost:3001';

/**
 * Tasks 5.2 + 5.3: URL Design Crawler UI E2E tests
 *
 * Tests the DesignPanel crawl integration:
 * - Crawl URL → iframe preview appears
 * - 照抄 mode → selection mode activates
 * - 類似設計 → tokens apply to form fields
 *
 * Requires Playwright browser installed in the server container.
 */

async function ensureLoggedIn(page: Page) {
  const status = await page.request.get(`${API}/api/auth/status`);
  const statusBody = await status.json();

  let token: string;
  if (!statusBody.hasUsers) {
    const setup = await page.request.post(`${API}/api/auth/setup`, {
      data: { name: `test-admin-${Date.now()}` },
    });
    token = (await setup.json()).token;
  } else {
    const users = await page.request.get(`${API}/api/auth/users`);
    const admin = (await users.json()).find((u: any) => u.role === 'admin' && u.is_active);
    const login = await page.request.post(`${API}/api/auth/login`, {
      data: { userId: admin.id },
    });
    token = (await login.json()).token;
  }

  await page.evaluate((t) => localStorage.setItem('pb-auth-token', t), token);
  return token;
}

test.describe('E2E: URL Design Crawler — DesignPanel', () => {
  let projectId = '';

  test.beforeAll(async ({ request }) => {
    // Create test project
    const res = await request.post(`${API}/api/projects`, {
      data: { name: `crawler-ui-test-${Date.now()}` },
    });
    const project = await res.json();
    projectId = project.id;
  });

  test.afterAll(async ({ request }) => {
    try {
      await request.delete(`${API}/api/projects/${projectId}`);
    } catch { /* ignore */ }
  });

  test('DesignPanel shows URL input and crawl button', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.goto(`/project/${projectId}`, { waitUntil: 'networkidle', timeout: 30000 });

    // Switch to design tab in left sidebar
    const designTab = page.getByText('設計', { exact: false }).or(
      page.getByRole('button', { name: /design|設計/i }),
    );
    await designTab.first().click();
    await page.waitForTimeout(500);

    // Look for the crawl URL input
    const crawlInput = page.getByPlaceholder('https://example.com').or(
      page.locator('[data-testid="crawl-url-input"]'),
    );
    await expect(crawlInput.first()).toBeVisible({ timeout: 10000 });

    // Look for the crawl button
    const crawlBtn = page.getByText('爬取').or(
      page.locator('[data-testid="crawl-btn"]'),
    );
    await expect(crawlBtn.first()).toBeVisible();
  });

  test('照抄 button toggles extract mode after crawl', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.goto(`/project/${projectId}`, { waitUntil: 'networkidle', timeout: 30000 });

    // Switch to design tab
    const designTab = page.getByText('設計', { exact: false }).or(
      page.getByRole('button', { name: /design|設計/i }),
    );
    await designTab.first().click();
    await page.waitForTimeout(500);

    // Enter URL and crawl
    const crawlInput = page.getByPlaceholder('https://example.com').or(
      page.locator('[data-testid="crawl-url-input"]'),
    );
    await crawlInput.first().fill('https://example.com');

    const crawlBtn = page.getByText('爬取').or(
      page.locator('[data-testid="crawl-btn"]'),
    );
    await crawlBtn.first().click();

    // Wait for crawl to complete (may take a while with Playwright)
    // Look for the 照抄 button to appear (means crawl succeeded)
    const copyBtn = page.locator('[data-testid="crawl-copy-btn"]').or(
      page.getByText('照抄'),
    );

    // If crawl fails (no browser), the buttons won't appear — skip gracefully
    const appeared = await copyBtn.first().isVisible({ timeout: 25000 }).catch(() => false);
    if (!appeared) {
      test.skip(true, 'Crawl did not complete — Playwright browser may not be available');
      return;
    }

    // Click 照抄 to enter extract mode
    await copyBtn.first().click();
    await page.waitForTimeout(300);

    // Button should now show "取消選取"
    await expect(page.getByText('取消選取')).toBeVisible({ timeout: 3000 });

    // Click again to exit
    await page.getByText('取消選取').click();
    await expect(page.getByText('照抄')).toBeVisible({ timeout: 3000 });
  });

  test('類似設計 applies crawled tokens to form', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.goto(`/project/${projectId}`, { waitUntil: 'networkidle', timeout: 30000 });

    // Switch to design tab
    const designTab = page.getByText('設計', { exact: false }).or(
      page.getByRole('button', { name: /design|設計/i }),
    );
    await designTab.first().click();
    await page.waitForTimeout(500);

    // Enter URL and crawl
    const crawlInput = page.getByPlaceholder('https://example.com').or(
      page.locator('[data-testid="crawl-url-input"]'),
    );
    await crawlInput.first().fill('https://example.com');

    const crawlBtn = page.getByText('爬取').or(
      page.locator('[data-testid="crawl-btn"]'),
    );
    await crawlBtn.first().click();

    // Wait for 類似設計 button
    const styleBtn = page.locator('[data-testid="crawl-similar-btn"]').or(
      page.getByText('類似設計'),
    );
    const appeared = await styleBtn.first().isVisible({ timeout: 25000 }).catch(() => false);
    if (!appeared) {
      test.skip(true, 'Crawl did not complete — Playwright browser may not be available');
      return;
    }

    // Click 類似設計
    await styleBtn.first().click();

    // Should show a success toast
    await expect(page.getByText('已套用爬取的設計風格')).toBeVisible({ timeout: 5000 });
  });
});
