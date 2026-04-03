# URL Design Crawler — Tasks

## Phase 1: 完整 HTML 爬取端點
- [x] 1.1 新增 `POST /api/projects/:id/crawl-full-page` — Playwright 爬取目標 URL，回傳完整 HTML + design tokens + 截圖
- [x] 1.2 HTML 處理：外部 CSS 內聯化、相對路徑圖片轉絕對路徑、移除 `<script>`
- [x] 1.3 複用現有 `crawlWebsite` 的 design tokens 邏輯
- [x] 1.4 E2E 測試：full-page endpoint

## Phase 2: DesignPanel URL 輸入 + iframe 預覽
- [x] 2.1 DesignPanel 頂部新增 URL 輸入框 + 「爬取」按鈕
- [x] 2.2 爬取完成後展開預覽區：CrawlPreview 元件渲染完整 HTML（sandboxed iframe）
- [x] 2.3 預覽區縮放 +/- 按鈕
- [x] 2.4 兩個選項按鈕：「照抄」(crawl-to-component) + 「類似設計」(crawl-to-style)

## Phase 3: 照抄 — crawl-to-component 選取模式
- [x] 3.1 抽取共用選取腳本 `utils/selectionScript.ts`
- [x] 3.2 CrawlPreview 注入選取腳本：hover 高亮 + click 選中 + postMessage 回傳
- [x] 3.3 選中後開啟 SaveComponentDialog：設定名稱/分類、存入元件庫
- [x] 3.4 CSS 作用域隔離：scoped class prefix `.crawled-[hash]`

## Phase 4: 類似設計 — crawl-to-style
- [x] 4.1 點擊「類似設計」後，將爬取的 design tokens 填入 DesignPanel token 欄位
- [x] 4.2 使用者可微調後儲存為專案 design profile（走現有 save 流程）

## Phase 5: E2E 測試
- [x] 5.1 E2E API：crawl-full-page endpoint（valid URL, invalid URL, missing URL）
- [x] 5.2 E2E UI：照抄模式 → 選取元素 → 存入元件庫
- [x] 5.3 E2E UI：類似設計 → tokens 填入 DesignPanel
