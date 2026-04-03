## Why

目前每次 AI 生成原型都是從零開始，即使同一團隊反覆使用相同的卡片樣式、導航列、表單佈局，AI 每次都重新發明。這導致：

1. **風格不一致** — 同品牌的不同專案，按鈕、卡片、表單長得不一樣
2. **浪費 token** — AI 花大量 token 重新生成已經驗證過的元件
3. **無法累積** — PM/設計師反覆微調出滿意的元件，但下個專案又要重來
4. **Figma 斷層** — 匯出到 Figma 時沒有 Component 概念，全部是散裝節點

需要一個跨專案的元件庫（Component Library），讓已驗證的 UI 元件可以被儲存、瀏覽、引用，並在 AI 生成時被優先使用。

## What Changes

### 元件擷取與儲存
- 從原型預覽中選取 DOM 片段（卡片、按鈕、導航列、表單等），一鍵存入元件庫
- 每個元件儲存：名稱、分類（navigation / card / form / button / hero / footer / modal / other）、HTML 片段、scoped CSS、縮圖（自動截圖）、design tokens 參考
- 元件支援版本歷史，更新時保留舊版本

### 元件庫管理 UI
- 全域元件庫頁面：卡片式瀏覽、分類篩選、關鍵字搜尋、即時預覽
- 元件詳情：HTML/CSS 原始碼檢視、即時預覽 iframe、編輯功能
- 批量操作：匯出、刪除、分類調整

### AI 生成整合（優先使用元件庫）
- 建立專案時可綁定元件庫（或選擇「全域元件庫」）
- AI 生成 prompt 注入匹配的元件 HTML/CSS 作為 reference
- Prompt 指令：「若元件庫有匹配的元件，優先使用其 HTML/CSS 結構，保持風格一致」
- 分類匹配邏輯：根據頁面架構中的元件類型（navigation、card-list、form 等）自動匹配元件庫中對應分類
- 生成後標記哪些元件來自元件庫，哪些是新生成的

### Crawler 整合
- 爬網站時除了 design tokens，也能擷取特定元件（按鈕、卡片、導航等）存入元件庫
- 支援批次擷取：一次爬多個頁面，自動分類並去重

### Figma 匯出整合
- 匯出到 Figma 時，元件庫元件標記為 Figma Component
- 相同元件在不同頁面自動成為 Component Instance（而非重複節點）

## Capabilities

### New Capabilities
- `component-library-crud`: 元件的新增、讀取、更新、刪除、版本管理
- `component-extract`: 從原型 iframe 中擷取 DOM 片段為元件
- `component-inject`: AI 生成時注入匹配的元件 HTML/CSS 到 prompt
- `component-crawl-extract`: 從爬取的網站中擷取 UI 元件
- `component-figma-export`: 匯出時將元件標記為 Figma Component

### Modified Capabilities
- `parallel-generation`: Sub-agent prompt 加入元件庫 reference injection
- `design-preset-system`: Preset 可綁定元件庫，作為風格 + 元件的完整套件
- `figma-export`: 匯出邏輯識別元件庫元件並轉為 Figma Component

## Impact

- **資料庫**：新增 `components` 表（id, name, category, html, css, thumbnail, design_tokens_ref, version, created_at, updated_at）、`component_versions` 表、`project_component_bindings` 表
- **伺服器端**：新增 `packages/server/src/routes/components.ts`、新增 `packages/server/src/services/componentExtractor.ts`、修改 `parallelGenerator.ts` 和 `masterAgent.ts` 注入元件 reference
- **前端**：新增 `ComponentLibraryPage.tsx`（全域元件庫）、新增 `ComponentPicker.tsx`（專案內選擇元件）、修改 `PreviewPanel.tsx`（加入「儲存為元件」按鈕）
- **Crawler**：修改 `websiteCrawler.ts` 加入元件擷取邏輯
- **新增依賴**：無重大新依賴（截圖用現有 Playwright / html2canvas）
