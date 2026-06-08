import { test, expect, Browser } from '@playwright/test';

let projectUrl = '';

async function getOrCreateProject(browser: Browser): Promise<string> {
  if (projectUrl) return projectUrl;
  const page = await browser.newPage();
  await page.goto('/projects');
  const name = 'pw-consult-' + Date.now();
  await page.locator('input[placeholder]').first().fill(name);
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/projects') && r.request().method() === 'POST', { timeout: 10000 }),
    page.locator('button[type="submit"]').click(),
  ]);
  const project = await response.json();
  await page.goto(`/projects/${project.id}`);
  projectUrl = page.url();
  await page.close();
  return projectUrl;
}

test('S2-1: 顧問模式合議 toggle 預設為 ON', async ({ page, browser }) => {
  const url = await getOrCreateProject(browser);
  await page.goto(url);
  await page.getByRole('tab', { name: '顧問' }).click().catch(() => {});
  const toggle = page.locator('[role="switch"]').first();
  await toggle.waitFor({ timeout: 5000 });
  const checked = await toggle.getAttribute('aria-checked');
  expect(checked).toBe('true');
});

test('S2-2: 右欄在顧問模式存在', async ({ page, browser }) => {
  const url = await getOrCreateProject(browser);
  await page.goto(url);
  // In consult mode, right inspector should be present
  await expect(page.locator('.workspace__right')).toBeVisible({ timeout: 5000 });
});

test('S2-3: 送出問題後出現 phase 動畫（推理中）', async ({ page, browser }) => {
  const url = await getOrCreateProject(browser);
  await page.goto(url);
  await page.getByRole('tab', { name: '顧問' }).click().catch(() => {});
  const composer = page.locator('textarea').last();
  await composer.fill('你好');
  await composer.press('Enter');
  // Should see some phase indicator briefly
  const phase = page.locator('[role="status"][class*="phase-indicator"]').first();
  await expect(phase).toBeVisible({ timeout: 10000 });
});

test('S2-4: AI 有回應', async ({ page, browser }) => {
  const url = await getOrCreateProject(browser);
  await page.goto(url);
  await page.getByRole('tab', { name: '顧問' }).click().catch(() => {});
  const composer = page.locator('textarea').last();
  await composer.fill('你好，請簡短回答你是什麼');
  await composer.press('Enter');
  // Wait for AI bubble
  await expect(page.locator('[class*="bubble--ai"]').first()).toBeVisible({ timeout: 45000 });
});

test('S2-5: 合議 toggle 狀態 per-project 持久', async ({ page, browser }) => {
  const url = await getOrCreateProject(browser);
  await page.goto(url);
  await page.getByRole('tab', { name: '顧問' }).click().catch(() => {});
  const toggle = page.locator('[role="switch"]').first();
  await toggle.waitFor({ timeout: 5000 });
  // Turn OFF
  if ((await toggle.getAttribute('aria-checked')) === 'true') {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  // Reload
  await page.reload();
  await page.getByRole('tab', { name: '顧問' }).click().catch(() => {});
  const toggleAfter = page.locator('[role="switch"]').first();
  await toggleAfter.waitFor({ timeout: 5000 });
  await expect(toggleAfter).toHaveAttribute('aria-checked', 'false');
});
