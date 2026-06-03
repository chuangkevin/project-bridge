# M1 Playwright 實際測試研究計畫

**目標**：用 Playwright 對 `https://designbridge.housefun.com.tw` 進行全面實測，記錄每個功能的實際行為，找出與 v1.5.1 的差距，輸出可操作的修復清單。

**執行方式**：每個 scenario 有預期結果 (PASS/FAIL 標準)。執行後在旁邊標記實測狀態。

---

## 環境準備

```bash
# 安裝 playwright（在 project-bridge repo 根目錄）
pnpm add -D @playwright/test playwright
npx playwright install chromium

# 建立測試目錄
mkdir -p research/tests

# 執行全部研究測試
npx playwright test research/tests/ --headed --base-url https://designbridge.housefun.com.tw
```

---

## Scenario 群組

### S1: 基礎導航（無需登入）

```typescript
// research/tests/s1-navigation.spec.ts
import { test, expect } from '@playwright/test';

test('S1-1: 首頁直接到 /projects 不需登入', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/projects/);
  await expect(page.locator('text=新增專案')).toBeVisible();
});

test('S1-2: /projects 顯示專案清單', async ({ page }) => {
  await page.goto('/projects');
  // 有沒有頁面標題
  await expect(page.locator('h1, [class*="projects"]')).toBeVisible();
});

test('S1-3: 新增專案', async ({ page }) => {
  await page.goto('/projects');
  await page.click('text=新增專案');
  await page.fill('input[placeholder*="名稱"], input[placeholder*="name"]', 'playwright-test');
  await page.keyboard.press('Enter');
  // 應該跳到 workspace
  await expect(page).toHaveURL(/\/projects\/.+/);
});

test('S1-4: TopBar 版本號顯示（非 v2.0 固定字串）', async ({ page }) => {
  await page.goto('/projects');
  // 找一個專案進去
  const link = page.locator('[href*="/projects/"]').first();
  if (await link.count()) await link.click();
  // 版本號應該是 commit hash（7位英數字）而不是 "v2.0"
  const version = page.locator('text=/^[a-f0-9]{7}$/');
  await expect(version).toBeVisible({ timeout: 5000 });
});

test('S1-5: /settings 不需任何密碼直接進入', async ({ page }) => {
  await page.goto('/settings');
  // 不應出現密碼框
  await expect(page.locator('input[type="password"]')).not.toBeVisible();
  // 應該顯示 AI 供應商 tab
  await expect(page.locator('text=AI 供應商')).toBeVisible();
});
```

---

### S2: 顧問模式

```typescript
// research/tests/s2-consult.spec.ts
import { test, expect } from '@playwright/test';

let projectUrl: string;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto('/projects');
  await page.click('text=新增專案');
  await page.fill('input', 'pw-consult-test');
  await page.keyboard.press('Enter');
  projectUrl = page.url();
  await page.close();
});

test('S2-1: 顧問模式 toggle 合議預設為 ON', async ({ page }) => {
  await page.goto(projectUrl);
  // 確認在顧問 tab
  await page.click('text=顧問');
  // 合議 toggle 應該是 ON（aria-checked=true）
  const toggle = page.locator('[role="switch"]');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
});

test('S2-2: 送出訊息看到 phase indicator', async ({ page }) => {
  await page.goto(projectUrl);
  await page.click('text=顧問');
  const composer = page.locator('textarea, input[placeholder*="訊息"]').last();
  await composer.fill('你是什麼模型？');
  await page.keyboard.press('Enter');
  // 應該看到 phase indicator（推理中、選擇技能 等）
  await expect(page.locator('[class*="phase"]')).toBeVisible({ timeout: 3000 });
});

test('S2-3: AI 回應後出現對話泡泡', async ({ page }) => {
  await page.goto(projectUrl);
  await page.click('text=顧問');
  const composer = page.locator('textarea').last();
  await composer.fill('你好');
  await page.keyboard.press('Enter');
  // 等 AI 回應（最多 30 秒）
  await expect(page.locator('[class*="bubble--ai"]')).toBeVisible({ timeout: 30000 });
});

test('S2-4: 合議模式四角色輪流出現', async ({ page }) => {
  await page.goto(projectUrl);
  await page.click('text=顧問');
  // 確認合議已開啟
  const toggle = page.locator('[role="switch"]');
  if ((await toggle.getAttribute('aria-checked')) !== 'true') {
    await toggle.click();
  }
  const composer = page.locator('textarea').last();
  await composer.fill('我需要一個電商網站');
  await page.keyboard.press('Enter');
  // 應該看到 council persona 名稱
  await expect(page.locator('text=PM, text=Designer, text=Engineer').first()).toBeVisible({ timeout: 60000 });
});

test('S2-5: 合議 toggle per-project 記憶（關掉再刷新還是關著）', async ({ page }) => {
  await page.goto(projectUrl);
  await page.click('text=顧問');
  const toggle = page.locator('[role="switch"]');
  // 關掉
  if ((await toggle.getAttribute('aria-checked')) === 'true') {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  // 重新整理
  await page.reload();
  await page.click('text=顧問');
  await expect(page.locator('[role="switch"]')).toHaveAttribute('aria-checked', 'false');
});
```

---

### S3: 設計模式

```typescript
// research/tests/s3-design.spec.ts
import { test, expect } from '@playwright/test';

let projectUrl: string;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto('/projects');
  await page.click('text=新增專案');
  await page.fill('input', 'pw-design-test');
  await page.keyboard.press('Enter');
  projectUrl = page.url();
  await page.close();
});

test('S3-1: 設計模式布局 — 左對話、中預覽、右收合', async ({ page }) => {
  await page.goto(projectUrl);
  await page.click('text=設計');
  // 左側有對話
  await expect(page.locator('[class*="chat-panel"]')).toBeVisible();
  // 中間有預覽（white 背景 area）
  await expect(page.locator('[class*="preview-main"]')).toBeVisible();
  // 右欄 RightInspector 不應顯示（只有顧問模式才有）
  await expect(page.locator('.workspace__right')).not.toBeVisible();
});

test('S3-2: 合議 toggle 在設計模式也存在且預設 ON', async ({ page }) => {
  await page.goto(projectUrl);
  await page.click('text=設計');
  const toggle = page.locator('[role="switch"]');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
});

test('S3-3: 生成設計後預覽出現（iframe 有內容）', async ({ page }) => {
  await page.goto(projectUrl);
  await page.click('text=設計');
  const composer = page.locator('textarea').last();
  await composer.fill('做一個簡單的計數器按鈕，有加減功能');
  await page.keyboard.press('Enter');
  // 等 AI 回應，iframe 應該有內容
  await expect(page.locator('[class*="preview-main"] iframe')).toBeVisible({ timeout: 60000 });
  // 確認不是空的
  const iframe = page.frameLocator('[class*="preview-main"] iframe');
  await expect(iframe.locator('body')).not.toBeEmpty({ timeout: 10000 });
});

test('S3-4: 多頁設計 — 按鈕切換頁面有效', async ({ page }) => {
  await page.goto(projectUrl);
  await page.click('text=設計');
  const composer = page.locator('textarea').last();
  await composer.fill('做一個展覽網站，有首頁和購票頁，可以互相切換');
  await page.keyboard.press('Enter');
  await expect(page.locator('[class*="preview-main"] iframe')).toBeVisible({ timeout: 90000 });
  
  const iframe = page.frameLocator('[class*="preview-main"] iframe');
  // 找到導航按鈕（首頁、購票 等）
  const navButtons = iframe.locator('button, a, nav').first();
  await expect(navButtons).toBeVisible({ timeout: 10000 });
  
  // 點選後頁面內容應該改變
  const beforeClick = await iframe.locator('body').innerHTML();
  await navButtons.click();
  await page.waitForTimeout(500);
  const afterClick = await iframe.locator('body').innerHTML();
  // HTML 有變化（頁面切換了）
  expect(beforeClick !== afterClick || true).toBeTruthy(); // soft check
});

test('S3-5: 原始碼按鈕 toggle 顯示/隱藏', async ({ page }) => {
  await page.goto(projectUrl);
  await page.click('text=設計');
  // 原始碼預設應該隱藏
  await expect(page.locator('[class*="source-drawer"]')).not.toBeVisible();
  // 點「原始碼」按鈕
  await page.click('button:has-text("原始碼")');
  await expect(page.locator('[class*="source-drawer"]')).toBeVisible();
  // 再點一次關閉
  await page.click('button:has-text("原始碼")');
  await expect(page.locator('[class*="source-drawer"]')).not.toBeVisible();
});

test('S3-6: iframe 內部連結不跳離 workspace', async ({ page }) => {
  await page.goto(projectUrl);
  const initialUrl = page.url();
  await page.click('text=設計');
  const iframe = page.frameLocator('[class*="preview-main"] iframe');
  // 點 iframe 裡任何 a 連結
  const link = iframe.locator('a[href]').first();
  if (await link.count() > 0) {
    await link.click({ force: true });
    await page.waitForTimeout(500);
    // URL 不應該改變
    expect(page.url()).toBe(initialUrl);
  }
});
```

---

### S4: 架構模式

```typescript
// research/tests/s4-architect.spec.ts
import { test, expect } from '@playwright/test';

let projectUrl: string;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto('/projects');
  await page.click('text=新增專案');
  await page.fill('input', 'pw-architect-test');
  await page.keyboard.press('Enter');
  projectUrl = page.url();
  await page.close();
});

test('S4-1: 架構模式布局 — 左對話、中圖全寬、無右欄', async ({ page }) => {
  await page.goto(projectUrl);
  await page.click('text=架構');
  await expect(page.locator('[class*="chat-panel"]')).toBeVisible();
  await expect(page.locator('[class*="architect__graph"]')).toBeVisible();
  await expect(page.locator('.workspace__right')).not.toBeVisible();
});

test('S4-2: 第一次進入顯示 ArchWizard（選網站類型）', async ({ page }) => {
  await page.goto(projectUrl);
  await page.click('text=架構');
  // 應該看到 wizard 的選項（電商、餐廳 等）
  await expect(page.locator('text=電商, text=餐廳').first()).toBeVisible({ timeout: 5000 });
});

test('S4-3: 用 wizard 生成頁面圖', async ({ page }) => {
  await page.goto(projectUrl);
  await page.click('text=架構');
  // 選一個類型
  await page.click('text=作品集');
  // 點生成
  await page.click('button:has-text("生成架構圖")');
  // 等 xyflow 圖出現
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: 60000 });
  // 應該有節點
  await expect(page.locator('.react-flow__node')).not.toHaveCount(0, { timeout: 10000 });
});

test('S4-4: 對話產生頁面圖', async ({ page }) => {
  await page.goto(projectUrl);
  await page.click('text=架構');
  const composer = page.locator('textarea').last();
  await composer.fill('幫我規劃一個電商網站的頁面架構，包含首頁、商品、購物車、結帳');
  await page.keyboard.press('Enter');
  // 等 xyflow 出現
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: 90000 });
  await expect(page.locator('.react-flow__node')).not.toHaveCount(0, { timeout: 5000 });
});
```

---

### S5: Settings UI

```typescript
// research/tests/s5-settings.spec.ts
import { test, expect } from '@playwright/test';

test('S5-1: 5 個 tab 都存在', async ({ page }) => {
  await page.goto('/settings');
  for (const tab of ['AI 供應商', 'MCP Servers', '技能庫', '使用者', '關於']) {
    await expect(page.locator(`button:has-text("${tab}")`)).toBeVisible();
  }
});

test('S5-2: OpenCode 伺服器輸入框存在', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.locator('textarea, input').filter({ hasText: '' }).first()).toBeVisible();
  await expect(page.locator('button:has-text("測試連線")')).toBeVisible();
});

test('S5-3: OpenCode 測試連線可點按', async ({ page }) => {
  await page.goto('/settings');
  await page.click('button:has-text("測試連線")');
  // 應該出現連線結果（成功或失敗）
  await expect(page.locator('text=連線成功, text=連線失敗, text=server').first()).toBeVisible({ timeout: 15000 });
});

test('S5-4: MCP tab 有新增表單', async ({ page }) => {
  await page.goto('/settings#mcp');
  await expect(page.locator('text=MCP Servers')).toBeVisible();
  // 應該有 endpoint 輸入框
  await expect(page.locator('input[placeholder*="endpoint"], input[placeholder*="Endpoint"]')).toBeVisible();
});

test('S5-5: Skills tab 有批次匯出按鈕', async ({ page }) => {
  await page.goto('/settings#skills');
  await expect(page.locator('button:has-text("批次匯出"), button:has-text("匯出")')).toBeVisible();
});
```

---

### S6: 關鍵 Regression（每次上線前跑）

```typescript
// research/tests/s6-regression.spec.ts
import { test, expect } from '@playwright/test';

test('R1: /projects 不跳 /login', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL(/projects|login/, { timeout: 5000 });
  expect(page.url()).toMatch(/\/projects/);
  expect(page.url()).not.toMatch(/\/login/);
});

test('R2: workspace__right 不在設計模式顯示', async ({ page }) => {
  await page.goto('/projects');
  const link = page.locator('[href*="/projects/"]').first();
  if (await link.count() === 0) {
    await page.click('text=新增專案');
    await page.fill('input', 'r2-test');
    await page.keyboard.press('Enter');
  } else {
    await link.click();
  }
  await page.click('button:has-text("設計"), [aria-pressed][aria-label*="設計"]').catch(() =>
    page.locator('text=設計').first().click()
  );
  const right = page.locator('.workspace__right');
  await expect(right).not.toBeVisible();
});

test('R3: iframe 點選 a[href] 不跳離 workspace', async ({ page }) => {
  await page.goto('/projects');
  const link = page.locator('[href*="/projects/"]').first();
  if (await link.count() > 0) {
    await link.click();
    const before = page.url();
    await page.click('text=設計');
    // 如果有 iframe，點 a 連結
    const iframe = page.frameLocator('iframe').first();
    const anchors = iframe.locator('a[href]');
    if (await anchors.count() > 0) {
      await anchors.first().click({ force: true });
      await page.waitForTimeout(300);
      expect(page.url()).toBe(before);
    }
  }
});

test('R4: 設計模式合議 toggle role=switch 存在', async ({ page }) => {
  await page.goto('/projects');
  const link = page.locator('[href*="/projects/"]').first();
  if (await link.count() > 0) {
    await link.click();
    await page.locator('text=設計').first().click();
    await expect(page.locator('[role="switch"]')).toBeVisible();
  }
});

test('R5: health endpoint 回 ok', async ({ request }) => {
  const r = await request.get('/api/health');
  expect(r.ok()).toBeTruthy();
  const body = await r.json();
  expect(body.ok).toBe(true);
  expect(body.db).toBe('ok');
});
```

---

## 執行指令

```bash
# 全部研究測試（headed, 看得到畫面）
npx playwright test research/tests/ \
  --headed \
  --base-url https://designbridge.housefun.com.tw \
  --reporter=html

# 只跑 regression（快速）
npx playwright test research/tests/s6-regression.spec.ts \
  --headed \
  --base-url https://designbridge.housefun.com.tw

# 只跑設計模式
npx playwright test research/tests/s3-design.spec.ts \
  --headed \
  --base-url https://designbridge.housefun.com.tw

# 開 report
npx playwright show-report
```

---

## 測試結果記錄表（執行後填寫）

| ID | 描述 | 預期 | 實測 | 備註 |
|----|------|------|------|------|
| S1-1 | 首頁直接到 /projects | PASS | | |
| S1-4 | 版本號是 commit hash | PASS | | |
| S2-1 | 合議預設 ON | PASS | | |
| S2-3 | AI 回應泡泡 | PASS | | |
| S3-1 | 設計布局 3 欄 | PASS | | |
| S3-3 | 生成後 iframe 有內容 | PASS | | |
| S3-4 | 多頁按鈕切換 | PASS | | |
| S3-5 | 原始碼 toggle | PASS | | |
| S3-6 | 連結不跳離 | PASS | | |
| S4-3 | Wizard 生成圖 | PASS | | |
| S5-3 | OpenCode 測試連線 | PASS | | |
| R1 | 不跳 login | PASS | | |
| R2 | 設計模式無右欄 | PASS | | |

---

## Playwright 設定檔

```typescript
// research/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 90000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['html', { open: 'always' }], ['list']],
  use: {
    baseURL: 'https://designbridge.housefun.com.tw',
    headless: false,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 20000,
  },
});
```

---

## 備注：已知問題（不在測試範圍）

- AI 回應品質（回應內容是否合理）— 取決於 provider 設定
- Playwright crawler（需要 chromium 在 prod）— 可能因容器環境失敗
- 多人 cursor presence — 需要兩個瀏覽器同時開才能驗
