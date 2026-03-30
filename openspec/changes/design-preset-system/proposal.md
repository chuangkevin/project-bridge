## Why

目前只有一個全域設計風格（HousePrice），專案可以覆蓋但沒有「風格庫」概念。使用者需要在不同場景（公司網站 vs 個人作品集 vs 客戶專案）快速切換設計風格，且希望能貼 URL 讓 AI 自動分析出風格。

## What Changes

- 新增 `design_presets` 表 — 多組可命名的設計風格預設
- 設定頁新增「設計風格庫」section — CRUD preset 卡片
- 新增 URL 分析功能 — 貼 1-3 個網站 URL，AI 爬取並分析出色彩/字型/元件風格
- 新建專案 dialog 可選擇 preset
- `projects` 表加 `design_preset_id` 欄位
- parallel generation 讀取 preset 的 design_convention 而非全域

## Capabilities

### New Capabilities
- `preset-crud`: 設計風格預設的新增/編輯/刪除/複製
- `url-style-analysis`: 貼 URL 讓 AI 爬取網站並提取設計風格
- `preset-binding`: 專案綁定 preset，generation 時使用對應風格

### Modified Capabilities
- (none)

## Impact

- `packages/server/src/db/migrations/030_design_presets.sql` — 新表 + projects 加欄位
- `packages/server/src/routes/designPresets.ts` — 新 CRUD routes
- `packages/server/src/services/urlStyleAnalyzer.ts` — 爬取 URL + AI 分析
- `packages/client/src/pages/SettingsPage.tsx` — 設計風格庫 UI
- `packages/client/src/components/NewProjectDialog.tsx` — preset 選擇
- `packages/server/src/routes/chat.ts` — 讀取 preset convention
- `packages/server/src/services/parallelGenerator.ts` — 使用 preset tokens
