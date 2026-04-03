# Component Library — Tasks

## Phase 1: 資料庫 + CRUD API
- [ ] 1.1 建立 `components` / `component_versions` / `project_component_bindings` 表（migration）
- [ ] 1.2 實作 `packages/server/src/routes/components.ts` — GET/POST/PUT/DELETE CRUD
- [ ] 1.3 實作元件版本歷史（更新時自動存舊版本到 component_versions）
- [ ] 1.4 實作 `POST /api/components/extract` — 接收 HTML/CSS，sanitize，生成截圖，儲存
- [ ] 1.5 實作 Playwright 截圖服務（renderComponentThumbnail）
- [ ] 1.6 註冊路由到 `index.ts`
- [ ] 1.7 E2E 測試：CRUD + extract + version history

## Phase 2: 元件庫 UI
- [ ] 2.1 新增 `ComponentLibraryPage.tsx` — 卡片瀏覽 + 分類 tab + 搜尋
- [ ] 2.2 元件詳情面板 — iframe 預覽 + HTML/CSS 原始碼 + 版本歷史
- [ ] 2.3 元件編輯功能 — 修改名稱/分類/HTML/CSS，即時預覽
- [ ] 2.4 批量操作 — 多選刪除、分類調整
- [ ] 2.5 新增路由到 App.tsx，主導航加入「元件庫」入口
- [ ] 2.6 E2E 測試：頁面渲染、篩選、搜尋、CRUD 操作

## Phase 3: 從原型擷取元件
- [ ] 3.1 PreviewPanel 加入「儲存為元件」按鈕（選取模式）
- [ ] 3.2 實作 iframe postMessage 互動 — 點選元素後回傳 outerHTML + computed CSS
- [ ] 3.3 擷取對話框 — 設定名稱、分類、tags
- [ ] 3.4 CSS scoping — 擷取時重寫 class 避免全域衝突
- [ ] 3.5 E2E 測試：從預覽中擷取元件完整流程

## Phase 4: AI 生成注入
- [ ] 4.1 實作 `componentInjector.ts` — 根據專案綁定 + 頁面架構匹配元件
- [ ] 4.2 修改 `parallelGenerator.ts` sub-agent prompt — 注入元件 reference
- [ ] 4.3 Token budget 管理 — 注入不超過 4000 tokens
- [ ] 4.4 生成後標記 `data-component-ref` 屬性
- [ ] 4.5 專案工作區加入 `ComponentPicker.tsx` — 綁定/解綁元件
- [ ] 4.6 E2E 測試：綁定元件後生成，驗證 prompt 包含元件 reference

## Phase 5: Crawler 元件擷取
- [ ] 5.1 實作 `POST /api/components/crawl-extract` — Playwright 開頁面 + 語義選擇器擷取
- [ ] 5.2 結構去重邏輯 — 同類型多個元素只保留代表性的一個
- [ ] 5.3 擷取預覽 UI — 使用者選擇要儲存哪些元件
- [ ] 5.4 批次 URL 爬取 + 跨頁去重
- [ ] 5.5 E2E 測試：爬取 URL → 擷取元件 → 儲存

## Phase 6: Figma 匯出整合
- [ ] 6.1 匯出時識別 `data-component-ref` 屬性，標記為 Figma Component
- [ ] 6.2 重複實例轉為 Component Instance
- [ ] 6.3 元件命名格式：`{category}/{name}`
- [ ] 6.4 元件庫頁面獨立匯出功能
- [ ] 6.5 E2E 測試：匯出驗證 component 標記
