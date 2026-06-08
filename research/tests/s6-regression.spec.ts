import { test, expect } from '@playwright/test';

async function getExistingProjectPath(page: any): Promise<string | null> {
  const r = await page.request.get('/api/projects');
  if (!r.ok()) return null;
  const data = await r.json();
  const projects: any[] = data.projects || [];
  return projects.length > 0 ? `/projects/${projects[0].id}` : null;
}

test('R1: 首頁不跳 login', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL(/.+/, { timeout: 8000 });
  expect(page.url()).not.toMatch(/\/login|\/setup/);
});

test('R2: /api/health 回 ok + db ok', async ({ request }) => {
  const r = await request.get('/api/health');
  expect(r.status()).toBe(200);
  const body = await r.json();
  expect(body.ok).toBe(true);
  expect(body.db).toBe('ok');
});

test('R3: 設計模式 workspace__right 不顯示', async ({ page }) => {
  const path = await getExistingProjectPath(page);
  if (!path) { test.skip(); return; }
  await page.goto(path);
  await page.getByRole('tab', { name: '設計' }).click();
  await page.waitForTimeout(300);
  await expect(page.locator('.workspace__right')).not.toBeVisible();
});

test('R4: 架構模式 workspace__right 不顯示', async ({ page }) => {
  const path = await getExistingProjectPath(page);
  if (!path) { test.skip(); return; }
  await page.goto(path);
  await page.getByRole('tab', { name: '架構' }).click();
  await page.waitForTimeout(300);
  await expect(page.locator('.workspace__right')).not.toBeVisible();
});

test('R5: 顧問模式合議 toggle 有 aria-checked 屬性', async ({ page }) => {
  const path = await getExistingProjectPath(page);
  if (!path) { test.skip(); return; }
  await page.goto(path);
  await page.getByRole('tab', { name: '顧問' }).click();
  const toggle = page.locator('[role="switch"]').first();
  await expect(toggle).toBeVisible({ timeout: 5000 });
  const checked = await toggle.getAttribute('aria-checked');
  expect(['true', 'false']).toContain(checked);
});

test('R6: /settings 直接進入無密碼阻擋', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.locator('text=AI 供應商')).toBeVisible({ timeout: 5000 });
});

test('R7: TopBar 顯示 v2.0 還是 hash（記錄）', async ({ page }) => {
  const path = await getExistingProjectPath(page);
  if (!path) { test.skip(); return; }
  await page.goto(path);
  const bodyText = await page.textContent('body') ?? '';
  const hasV20 = bodyText.includes('v2.0');
  const hashMatch = bodyText.match(/\b[a-f0-9]{7}\b/);
  console.log(`Version display: v2.0=${hasV20}, hashFound=${!!hashMatch?.[0]}`);
  // FAIL if still showing v2.0 as hardcoded
  expect(hasV20).toBe(false);
});
