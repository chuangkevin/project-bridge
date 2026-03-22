import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

const MULTI_PAGE_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Test</title>
<style>
.page { padding: 20px; }
button { padding: 10px 20px; cursor: pointer; }
</style>
<script>
function showPage(name) {
  document.querySelectorAll('[data-page]').forEach(function(p) { p.style.display = 'none'; });
  var t = document.querySelector('[data-page="' + name + '"]');
  if (t) t.style.display = '';
}
</script>
</head>
<body>
<div class="page" data-page="首頁">
  <h1 data-bridge-id="h1-home">歡迎光臨</h1>
  <button data-bridge-id="btn-to-about">關於我們</button>
  <button data-bridge-id="btn-to-contact">聯絡我們</button>
</div>
<div class="page" data-page="關於" style="display:none;">
  <h2 data-bridge-id="h2-about">關於頁面</h2>
  <button data-bridge-id="btn-to-home">回首頁</button>
</div>
<div class="page" data-page="聯絡" style="display:none;">
  <h3 data-bridge-id="h3-contact">聯絡頁面</h3>
  <a data-bridge-id="link-to-home" href="#">回首頁</a>
</div>
</body>
</html>`;

test.describe('Page Mapping - E2E UI', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: `PageMapping E2E ${Date.now()}` },
    });
    const project = await res.json();
    projectId = project.id;

    // Seed multi-page prototype
    await request.post(`${API}/api/projects/${projectId}/prototype/seed`, {
      data: { html: MULTI_PAGE_HTML },
    });
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      try {
        await request.delete(`${API}/api/projects/${projectId}`);
      } catch { /* ignore */ }
    }
  });

  test('6.1 - enter page-mapping mode and verify page overview', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.waitForLoadState('networkidle');

    // Skip onboarding if visible
    const skipBtn = page.getByRole('button', { name: /跳過/ });
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click();
    }

    // Wait for iframe to load with prototype
    const iframe = page.locator('iframe[title="原型預覽"]');
    await expect(iframe).toBeVisible({ timeout: 15000 });

    // Click page-mapping toggle button
    const mappingToggle = page.getByTestId('page-mapping-toggle');
    await expect(mappingToggle).toBeVisible({ timeout: 5000 });
    await expect(mappingToggle).toBeEnabled();
    await mappingToggle.click();

    // Verify page overview is visible in the panel
    // Should show 3 pages: 首頁, 關於, 聯絡
    const panel = page.locator('div', { hasText: '頁面總覽' }).first();
    await expect(panel).toBeVisible({ timeout: 5000 });

    // Check pages exist in the mapping panel (use the panel's span elements)
    await expect(panel.locator('span', { hasText: '首頁' })).toBeVisible({ timeout: 5000 });
    await expect(panel.locator('span', { hasText: '關於' })).toBeVisible({ timeout: 5000 });
    await expect(panel.locator('span', { hasText: '聯絡' })).toBeVisible({ timeout: 5000 });

    // Verify the placeholder text for element selection
    await expect(page.getByText('點選原型中的元素')).toBeVisible();
  });

  test('6.1b - page-mapping toggle disabled when no prototype', async ({ page, request }) => {
    // Create a fresh project without prototype
    const res = await request.post(`${API}/api/projects`, {
      data: { name: `No Proto ${Date.now()}` },
    });
    const emptyProject = await res.json();

    await page.goto(`/project/${emptyProject.id}`);
    await page.waitForLoadState('networkidle');

    const skipBtn = page.getByRole('button', { name: /跳過/ });
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click();
    }

    // Page mapping toggle should be disabled
    const mappingToggle = page.getByTestId('page-mapping-toggle');
    await expect(mappingToggle).toBeVisible({ timeout: 5000 });
    await expect(mappingToggle).toBeDisabled();

    // Cleanup
    await request.delete(`${API}/api/projects/${emptyProject.id}`);
  });
});
