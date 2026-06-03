import { test, expect } from '@playwright/test';

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
  await page.goto('/projects');
  const link = page.locator('a[href*="/projects/"]:not([href="/projects"])').first();
  if (await link.count() > 0) {
    await link.click();
    await page.waitForURL(/\/projects\/.+/);
    await page.locator('button:has-text("設計"), text=設計').first().click().catch(() => {});
    await page.waitForTimeout(500);
    await expect(page.locator('.workspace__right')).not.toBeVisible();
  } else {
    test.skip();
  }
});

test('R4: 架構模式 workspace__right 不顯示', async ({ page }) => {
  await page.goto('/projects');
  const link = page.locator('a[href*="/projects/"]:not([href="/projects"])').first();
  if (await link.count() > 0) {
    await link.click();
    await page.waitForURL(/\/projects\/.+/);
    await page.locator('button:has-text("架構"), text=架構').first().click().catch(() => {});
    await page.waitForTimeout(500);
    await expect(page.locator('.workspace__right')).not.toBeVisible();
  } else {
    test.skip();
  }
});

test('R5: 顧問模式合議 toggle 有 aria-checked 屬性', async ({ page }) => {
  await page.goto('/projects');
  const link = page.locator('a[href*="/projects/"]:not([href="/projects"])').first();
  if (await link.count() > 0) {
    await link.click();
    await page.waitForURL(/\/projects\/.+/);
    await page.locator('button:has-text("顧問"), text=顧問').first().click().catch(() => {});
    const toggle = page.locator('[role="switch"]').first();
    await expect(toggle).toBeVisible({ timeout: 5000 });
    const checked = await toggle.getAttribute('aria-checked');
    expect(['true', 'false']).toContain(checked);
  } else {
    test.skip();
  }
});

test('R6: /settings 直接進入無密碼阻擋', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.locator('text=AI 供應商')).toBeVisible({ timeout: 5000 });
});

test('R7: TopBar 顯示 v2.0 還是 hash（記錄）', async ({ page }) => {
  await page.goto('/projects');
  const link = page.locator('a[href*="/projects/"]:not([href="/projects"])').first();
  if (await link.count() > 0) {
    await link.click();
    await page.waitForURL(/\/projects\/.+/);
    const bodyText = await page.textContent('body') ?? '';
    const hasV20 = bodyText.includes('v2.0');
    const hashMatch = bodyText.match(/\b[a-f0-9]{7}\b/);
    console.log(`Version display: v2.0=${hasV20}, hashFound=${!!hashMatch?.[0]}`);
    // FAIL if still showing v2.0 as hardcoded
    expect(hasV20).toBe(false);
  } else {
    test.skip();
  }
});
