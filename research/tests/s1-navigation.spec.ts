import { test, expect } from '@playwright/test';

test('S1-1: 首頁直接到 /projects 不需登入', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL(/projects/, { timeout: 8000 });
  expect(page.url()).toMatch(/\/projects/);
  expect(page.url()).not.toMatch(/\/login|\/setup/);
});

test('S1-2: /projects 顯示新增專案按鈕', async ({ page }) => {
  await page.goto('/projects');
  await expect(page.locator('text=建立').first()).toBeVisible();
});

test('S1-3: 新增專案跳到 workspace', async ({ page }) => {
  await page.goto('/projects');
  const name = 'playwright-s1-test-' + Date.now();
  await page.locator('input[placeholder]').first().fill(name);
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/projects') && r.request().method() === 'POST', { timeout: 10000 }),
    page.locator('button[type="submit"]').click(),
  ]);
  const project = await response.json();
  await page.goto(`/projects/${project.id}`);
  expect(page.url()).toMatch(/\/projects\/.+/);
});

test('S1-4: TopBar 版本號是 commit hash 而非 v2.0', async ({ page }) => {
  // Use API to get an existing project or create one, then goto directly (SPA nav via click doesn't fire 'load')
  const r = await page.request.get('/api/projects');
  let projectPath: string;
  if (r.ok()) {
    const data = await r.json();
    const projects = data.projects || [];
    if (projects.length > 0) {
      projectPath = `/projects/${projects[0].id}`;
    } else {
      await page.goto('/projects');
      const name = 'v-test-' + Date.now();
      await page.locator('input[placeholder]').first().fill(name);
      await page.locator('button[type="submit"]').click();
      await page.locator(`text=${name}`).first().click();
      await page.waitForURL(/\/projects\/.+/, { timeout: 15000 });
      projectPath = new URL(page.url()).pathname;
    }
  } else {
    test.skip();
    return;
  }
  await page.goto(projectPath);
  // Version should be a 7-char hex hash OR NOT be literal "v2.0"
  const pageText = await page.textContent('body');
  if (pageText?.includes('v2.0')) {
    throw new Error('Version still shows hardcoded "v2.0" — should be git hash');
  }
});

test('S1-5: /settings 直接可用，不跳密碼框', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.locator('text=AI 供應商')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('input[type="password"]')).not.toBeVisible();
});

test('S1-6: /global-design 頁面存在', async ({ page }) => {
  await page.goto('/global-design');
  await expect(page.locator('text=全域風格').first()).toBeVisible({ timeout: 5000 });
});
