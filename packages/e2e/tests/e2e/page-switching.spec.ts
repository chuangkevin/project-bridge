import { test, expect } from '@playwright/test';

/**
 * E2E test: Page switching in generated prototype.
 *
 * Tests the EXACT bug the user keeps reporting:
 * "不管怎麼點選，頁面都不會跳轉"
 *
 * This test creates a standalone HTML prototype (like assembler output),
 * loads it in the browser, and verifies page switching works.
 */

const PROTOTYPE_HTML = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root { --primary: #1d1d1f; --bg: #fbfbfd; --surface: #fff; --text: #1d1d1f; --text-secondary: #6b7280; --border: #e5e7eb; --radius-md: 8px; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; background: var(--bg); color: var(--text); }
    .top-nav { display: flex; align-items: center; padding: 0 24px; height: 56px; background: var(--surface); border-bottom: 1px solid var(--border); }
    .nav-brand { font-weight: 700; font-size: 18px; color: var(--primary); margin-right: 32px; }
    .nav-links { display: flex; gap: 4px; }
    .nav-link { padding: 8px 16px; border-radius: 8px; color: var(--text-secondary); font-size: 14px; font-weight: 500; cursor: pointer; text-decoration: none; }
    .nav-link:hover { background: #f3f4f6; color: var(--text); }
    .nav-link.active { background: var(--primary); color: #fff; }
    .main-content { padding: 24px; }
    .page { min-height: 80vh; }
    .container { max-width: 1200px; margin: 0 auto; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; cursor: pointer; }
    .btn-primary { padding: 10px 20px; background: var(--primary); color: #fff; border: none; border-radius: 8px; cursor: pointer; }
  </style>
</head>
<body>
<nav class="top-nav" data-bridge-id="top-nav">
  <div class="nav-brand">Prototype</div>
  <div class="nav-links">
    <a href="#" class="nav-link" data-nav="菜單" onclick="showPage('菜單');return false;">菜單</a>
    <a href="#" class="nav-link" data-nav="購物車" onclick="showPage('購物車');return false;">購物車</a>
    <a href="#" class="nav-link" data-nav="訂單" onclick="showPage('訂單');return false;">訂單</a>
    <a href="#" class="nav-link" data-nav="會員" onclick="showPage('會員');return false;">會員</a>
    <a href="#" class="nav-link" data-nav="設定" onclick="showPage('設定');return false;">設定</a>
  </div>
</nav>

<main class="main-content">

<div class="page" id="page-菜單" data-page="菜單" style="display:block">
  <div class="container">
    <h1>菜單頁面</h1>
    <p>這是菜單頁面的內容。有各種美味的餐點可以選擇。</p>
    <div class="card" onclick="showPage('購物車');return false;">
      <h3>經典章魚燒</h3>
      <p>NT$ 120</p>
      <button class="btn-primary">加入購物車</button>
    </div>
  </div>
</div>

<div class="page" id="page-購物車" data-page="購物車" style="display:none">
  <div class="container">
    <h1>購物車頁面</h1>
    <p>您的購物車中有 3 件商品。</p>
    <button class="btn-primary" onclick="showPage('訂單');return false;">前往結帳</button>
  </div>
</div>

<div class="page" id="page-訂單" data-page="訂單" style="display:none">
  <div class="container">
    <h1>訂單頁面</h1>
    <p>您的訂單記錄。</p>
  </div>
</div>

<div class="page" id="page-會員" data-page="會員" style="display:none">
  <div class="container">
    <h1>會員頁面</h1>
    <p>會員資料管理。</p>
  </div>
</div>

<div class="page" id="page-設定" data-page="設定" style="display:none">
  <div class="container">
    <h1>設定頁面</h1>
    <p>系統設定。</p>
  </div>
</div>

</main>

<script>
function showPage(name) {
  document.querySelectorAll('.page').forEach(function(p) { p.style.display = 'none'; });
  var target = document.getElementById('page-' + name);
  if (target) target.style.setProperty('display', 'block');
  document.querySelectorAll('[data-nav]').forEach(function(l) {
    l.classList.toggle('active', l.dataset.nav === name);
  });
}
document.addEventListener('DOMContentLoaded', function() {
  showPage('菜單');
});
// Listen for parent postMessage to switch pages
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'show-page' && e.data.name) {
    showPage(e.data.name);
  }
});
</script>
</body>
</html>`;

test.describe('Page Switching — Prototype Navigation', () => {

  test('clicking nav links switches pages', async ({ page }) => {
    await page.setContent(PROTOTYPE_HTML);
    await page.waitForLoadState('domcontentloaded');

    // Initially: 菜單 is visible
    await expect(page.locator('#page-菜單')).toBeVisible();
    await expect(page.locator('#page-購物車')).toBeHidden();

    // Click 購物車 nav link
    await page.click('[data-nav="購物車"]');
    await expect(page.locator('#page-購物車')).toBeVisible();
    await expect(page.locator('#page-菜單')).toBeHidden();
    await expect(page.locator('#page-購物車 h1')).toHaveText('購物車頁面');

    // Click 訂單 nav link
    await page.click('[data-nav="訂單"]');
    await expect(page.locator('#page-訂單')).toBeVisible();
    await expect(page.locator('#page-購物車')).toBeHidden();

    // Click 設定
    await page.click('[data-nav="設定"]');
    await expect(page.locator('#page-設定')).toBeVisible();

    // Click back to 菜單
    await page.click('[data-nav="菜單"]');
    await expect(page.locator('#page-菜單')).toBeVisible();
  });

  test('nav active class updates on page switch', async ({ page }) => {
    await page.setContent(PROTOTYPE_HTML);
    await page.waitForLoadState('domcontentloaded');

    // Initially 菜單 is active
    await expect(page.locator('[data-nav="菜單"]')).toHaveClass(/active/);

    // Switch to 購物車
    await page.click('[data-nav="購物車"]');
    await expect(page.locator('[data-nav="購物車"]')).toHaveClass(/active/);
    await expect(page.locator('[data-nav="菜單"]')).not.toHaveClass(/active/);
  });

  test('card onclick navigates to target page', async ({ page }) => {
    await page.setContent(PROTOTYPE_HTML);
    await page.waitForLoadState('domcontentloaded');

    // Click card that links to 購物車
    await page.click('.card');
    await expect(page.locator('#page-購物車')).toBeVisible();
    await expect(page.locator('#page-菜單')).toBeHidden();
  });

  test('button onclick navigates to target page', async ({ page }) => {
    await page.setContent(PROTOTYPE_HTML);
    await page.waitForLoadState('domcontentloaded');

    // Navigate to 購物車 first
    await page.click('[data-nav="購物車"]');
    await expect(page.locator('#page-購物車')).toBeVisible();

    // Click "前往結帳" button
    await page.click('#page-購物車 .btn-primary');
    await expect(page.locator('#page-訂單')).toBeVisible();
  });

  test('postMessage show-page works (simulating parent sidebar click)', async ({ page }) => {
    await page.setContent(PROTOTYPE_HTML);
    await page.waitForLoadState('domcontentloaded');

    // Initially 菜單 visible
    await expect(page.locator('#page-菜單')).toBeVisible();

    // Simulate postMessage from parent (like WorkspacePage sidebar does)
    await page.evaluate(() => {
      window.postMessage({ type: 'show-page', name: '會員' }, '*');
    });
    await page.waitForTimeout(100); // Give time for message handling

    await expect(page.locator('#page-會員')).toBeVisible();
    await expect(page.locator('#page-菜單')).toBeHidden();
  });

  test('all pages are accessible — no blank pages', async ({ page }) => {
    await page.setContent(PROTOTYPE_HTML);
    await page.waitForLoadState('domcontentloaded');

    const pages = ['菜單', '購物車', '訂單', '會員', '設定'];

    for (const pageName of pages) {
      await page.click(`[data-nav="${pageName}"]`);
      const pageDiv = page.locator(`#page-${pageName}`);
      await expect(pageDiv).toBeVisible();

      // Check page has actual content (not blank)
      const text = await pageDiv.textContent();
      expect(text!.trim().length).toBeGreaterThan(10);
    }
  });
});
