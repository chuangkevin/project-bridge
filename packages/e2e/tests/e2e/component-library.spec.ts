import { test, expect, type Page } from '@playwright/test';

const API = 'http://localhost:3001';

/**
 * Task 2.6: Component Library — page render, filter, search, CRUD
 *
 * Route: /components
 * API:   /api/components (GET/POST/PUT/DELETE)
 *
 * Covers:
 *  - Page renders with title "元件庫"
 *  - Component card appears after API creation
 *  - Category tab filtering
 *  - Search bar with debounce
 *  - Detail panel opens on card click
 *  - Delete via API cleanup
 */

// ─── Auth Helper ─────────────────────────────────────────────

async function ensureLoggedIn(page: Page) {
  const status = await page.request.get(`${API}/api/auth/status`);
  const statusBody = await status.json();

  let token: string;
  if (!statusBody.hasUsers) {
    const setup = await page.request.post(`${API}/api/auth/setup`, {
      data: { name: `test-admin-${Date.now()}` },
    });
    const body = await setup.json();
    token = body.token;
  } else {
    const users = await page.request.get(`${API}/api/auth/users`);
    const userList = await users.json();
    const admin = userList.find((u: any) => u.role === 'admin' && u.is_active);
    const login = await page.request.post(`${API}/api/auth/login`, {
      data: { userId: admin.id },
    });
    const body = await login.json();
    token = body.token;
  }

  await page.evaluate((t) => localStorage.setItem('pb-auth-token', t), token);
  return token;
}

// ─── Helpers ─────────────────────────────────────────────────

const uniqueName = () => `E2E Component ${Date.now()}`;

async function createComponentViaAPI(
  request: any,
  overrides: Record<string, any> = {},
) {
  const data = {
    name: uniqueName(),
    category: 'card',
    html: '<div class="card"><h3>Sample Card</h3><p>Content</p></div>',
    css: '.card { padding: 16px; border: 1px solid #e2e8f0; border-radius: 8px; }',
    tags: JSON.stringify(['e2e', 'test']),
    ...overrides,
  };
  const res = await request.post(`${API}/api/components`, { data });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function deleteComponentViaAPI(request: any, id: string) {
  await request.delete(`${API}/api/components/${id}`);
}

// ─── Tests ───────────────────────────────────────────────────

test.describe('E2E: Component Library Page', () => {
  const createdIds: string[] = [];

  test.afterAll(async ({ request }) => {
    for (const id of createdIds) {
      try {
        await deleteComponentViaAPI(request, id);
      } catch {
        /* best-effort cleanup */
      }
    }
  });

  test('renders /components page with title 元件庫', async ({ page }) => {
    await ensureLoggedIn(page);
    await page.goto('/components', { waitUntil: 'networkidle' });

    // Verify page title
    await expect(page.getByText('元件庫')).toBeVisible({ timeout: 10000 });

    // Verify "+ 新增元件" button is present
    await expect(page.getByText('新增元件')).toBeVisible();
  });

  test('component card appears after API creation', async ({ page, request }) => {
    const name = `E2E Visible Card ${Date.now()}`;
    const comp = await createComponentViaAPI(request, { name, category: 'card' });
    createdIds.push(comp.id);

    await ensureLoggedIn(page);
    await page.goto('/components', { waitUntil: 'networkidle' });

    // The created component should appear in the grid
    await expect(page.getByText(name)).toBeVisible({ timeout: 10000 });
  });

  test('category tab filtering narrows results', async ({ page, request }) => {
    // Create components in two different categories
    const navComp = await createComponentViaAPI(request, {
      name: `E2E NavComp ${Date.now()}`,
      category: 'navigation',
      html: '<nav><a href="/">Home</a></nav>',
    });
    createdIds.push(navComp.id);

    const formComp = await createComponentViaAPI(request, {
      name: `E2E FormComp ${Date.now()}`,
      category: 'form',
      html: '<form><input type="text" /></form>',
    });
    createdIds.push(formComp.id);

    await ensureLoggedIn(page);
    await page.goto('/components', { waitUntil: 'networkidle' });

    // Click "navigation" category tab
    const navTab = page.getByRole('button', { name: /navigation/i }).or(
      page.getByText('navigation', { exact: false }),
    );
    await navTab.first().click();
    await page.waitForTimeout(500);

    // Navigation component should be visible
    await expect(page.getByText(navComp.name)).toBeVisible({ timeout: 5000 });

    // Form component should NOT be visible while filtering by navigation
    await expect(page.getByText(formComp.name)).not.toBeVisible({ timeout: 3000 });

    // Switch to "form" tab
    const formTab = page.getByRole('button', { name: /form/i }).or(
      page.getByText('form', { exact: false }),
    );
    await formTab.first().click();
    await page.waitForTimeout(500);

    // Now form component should be visible
    await expect(page.getByText(formComp.name)).toBeVisible({ timeout: 5000 });
  });

  test('search bar filters components by name', async ({ page, request }) => {
    const searchToken = `SearchToken${Date.now()}`;
    const comp = await createComponentViaAPI(request, {
      name: `E2E ${searchToken}`,
      category: 'button',
      html: '<button class="btn">Click Me</button>',
    });
    createdIds.push(comp.id);

    await ensureLoggedIn(page);
    await page.goto('/components', { waitUntil: 'networkidle' });

    // Find the search input
    const searchInput = page.getByPlaceholder(/搜尋|search/i).or(
      page.locator('input[type="search"], input[type="text"]').first(),
    );
    await searchInput.first().fill(searchToken);

    // Wait for debounce (300ms) + network
    await page.waitForTimeout(600);

    // The matching component should be visible
    await expect(page.getByText(searchToken)).toBeVisible({ timeout: 5000 });
  });

  test('clicking a component card opens the detail panel', async ({ page, request }) => {
    const name = `E2E DetailPanel ${Date.now()}`;
    const comp = await createComponentViaAPI(request, { name, category: 'card' });
    createdIds.push(comp.id);

    await ensureLoggedIn(page);
    await page.goto('/components', { waitUntil: 'networkidle' });

    // Click the component card
    await page.getByText(name).click();

    // Detail panel should slide in — look for component name in a detail/panel context
    // The panel typically shows the component name, category, and edit/delete buttons
    const panel = page.locator('[class*="panel"], [class*="detail"], [class*="drawer"], [class*="slide"]');
    await expect(panel.first()).toBeVisible({ timeout: 5000 });

    // Edit or delete buttons should be present in the panel
    const editOrDeleteBtn = page.getByRole('button', { name: /編輯|刪除|edit|delete/i });
    await expect(editOrDeleteBtn.first()).toBeVisible({ timeout: 5000 });
  });

  test('delete component via API and verify removal from grid', async ({ page, request }) => {
    const name = `E2E ToDelete ${Date.now()}`;
    const comp = await createComponentViaAPI(request, { name, category: 'other' });

    await ensureLoggedIn(page);
    await page.goto('/components', { waitUntil: 'networkidle' });

    // Verify component is visible
    await expect(page.getByText(name)).toBeVisible({ timeout: 10000 });

    // Delete via API
    await deleteComponentViaAPI(request, comp.id);

    // Reload and verify it's gone
    await page.goto('/components', { waitUntil: 'networkidle' });
    await expect(page.getByText(name)).not.toBeVisible({ timeout: 5000 });
  });
});
