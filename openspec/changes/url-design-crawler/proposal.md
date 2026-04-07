## Why

目前的網站爬蟲（`websiteCrawler.ts`）只回傳 design tokens（色彩、字體、圓角等）加上一張截圖。使用者無法看到爬取頁面的實際畫面，也無法從中互動選取元素。這導致：

1. **看不到就無法選** — 使用者貼完 URL 後只拿到一組抽象的色票數字，不知道這些數字對應畫面上的哪些區塊，無法判斷要不要採用
2. **「照抄」流程斷裂** — 想要直接複製某個網站的卡片、導航列或 hero 區塊，但現有流程只能擷取 design tokens，沒有辦法取得完整 HTML/CSS 片段
3. **與元件庫無法銜接** — Phase 3 已經實作了從 AI 原型 iframe 中選取 DOM 片段存入元件庫的功能（`component-extract`），但爬取外部網站時完全用不到這條路徑
4. **兩步才能完成一步的事** — 使用者想參考某網站風格，要先爬取、再手動看截圖、再自己腦補要怎麼調 design tokens，體驗很差

需要讓使用者在設計頁面直接貼 URL → 看到即時預覽 → 選擇「照抄」或「類似設計」兩條路徑。

## What Changes

### 新增爬取端點：回傳完整 HTML

- 新增 `/api/crawl/full-page` 端點，使用 Playwright 爬取目標 URL 後回傳：
  - 完整 HTML（含 inline styles、外部 CSS 內聯化）
  - 原有的 design tokens（複用現有 `crawlWebsite` 邏輯）
  - 頁面截圖（base64）
- HTML 處理：將外部 CSS `<link>` 轉為 `<style>` 內聯、相對路徑圖片轉為絕對路徑、移除 `<script>` 標籤（安全性）

### DesignPanel URL 輸入區

- 在 `DesignPanel.tsx` 頂部新增 URL 輸入框 + 「爬取」按鈕
- 爬取完成後展開預覽區域，顯示兩個選項按鈕：
  - 🔲 **照抄** — 進入選取模式
  - 🎨 **類似設計** — 套用 design tokens 到專案風格（走現有流程）

### iframe 即時預覽

- 使用 `srcdoc` 將爬取回來的完整 HTML 渲染在 sandboxed iframe 中
- iframe sandbox 屬性：`allow-same-origin`（讀取 DOM 需要）、不允許 scripts/forms/popups
- 預覽區域可縮放（zoom slider），讓使用者看到完整頁面

### 「照抄」選取模式（crawl-to-component）

- 複用 Phase 3 已實作的 `component-extract` 互動模式：
  - 使用者在 iframe 中 hover → 高亮目標區塊（藍色邊框 + 半透明遮罩）
  - 點擊 → 選中區塊（綠色邊框），可多選
  - 透過 `postMessage` 從 iframe 傳回選中區塊的 `outerHTML` + computed styles
- 選中後彈出確認面板：預覽擷取的元件、輸入名稱和分類、一鍵存入元件庫
- CSS 作用域隔離：擷取的 HTML/CSS 加上 scoped class prefix（如 `.crawled-[hash]`），避免與專案現有樣式衝突

### 「類似設計」路徑（crawl-to-style）

- 點擊「類似設計」後，直接將爬取的 design tokens 填入 DesignPanel 的 token 欄位
- 使用者可以在套用前微調各項 token 值
- 確認後儲存為專案的 design profile（走現有 `/api/projects/:id/design` 端點）

### iframe 內注入的選取腳本

- 爬取 HTML 回傳前，伺服器端注入一段輕量 JS 到 HTML 中：
  - 監聽 `mouseover` → 高亮元素
  - 監聯 `click` → `postMessage` 傳回 `{ type: 'element-selected', html, css, rect }`
  - 只在收到父頁面 `{ type: 'enter-selection-mode' }` 訊息後啟動
- 此腳本與 Phase 3 的 prototype iframe 選取腳本邏輯相同，可抽取為共用模組

## Capabilities

### New Capabilities
- `url-visual-crawler`：貼 URL → Playwright 爬取完整 HTML + design tokens + 截圖 → iframe 即時預覽
- `crawl-to-component`：在爬取預覽中進入選取模式 → 選中區塊 → 擷取為元件存入元件庫（含 CSS 作用域隔離）
- `crawl-to-style`：從爬取結果提取 design tokens → 一鍵套用為專案風格

### Modified Capabilities
- `component-extract`：選取腳本抽取為共用模組，同時服務 AI 原型 iframe 與爬取預覽 iframe
- `website-crawler`：新增完整 HTML 回傳模式（現有 design-tokens-only 模式保留）

## Impact

- **伺服器端**
  - 修改 `packages/server/src/services/websiteCrawler.ts`：新增 `crawlFullPage()` 函式，回傳清理後的完整 HTML + 內聯 CSS
  - 新增 `packages/server/src/routes/crawl.ts`：`POST /api/crawl/full-page` 端點
  - 修改 `packages/server/src/index.ts`：掛載新 route

- **前端**
  - 修改 `packages/client/src/components/DesignPanel.tsx`：新增 URL 輸入框、爬取按鈕、iframe 預覽區、照抄/類似設計選擇
  - 新增 `packages/client/src/components/CrawlPreview.tsx`：iframe 預覽元件 + 選取模式 UI
  - 新增 `packages/client/src/components/shared/selectionScript.ts`：共用 iframe 選取腳本（從 Phase 3 的 prototype 選取邏輯抽取）
  - 修改 `packages/client/src/components/PreviewPanel.tsx`：改用共用選取腳本模組

- **新增依賴**：無（Playwright 已有、iframe postMessage 為原生 API）
