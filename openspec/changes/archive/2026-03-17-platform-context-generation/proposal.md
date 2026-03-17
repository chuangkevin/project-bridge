## Why

本工具用於企業內部，所有設計需求都是在**現有平台 UI 架構**下的功能擴充——新增頁面、子頁面、元件——而非獨立原型。現有生成邏輯只會輸出完整獨立 HTML 頁面，導致：
- 生成物與實際平台的 nav/sidebar/header 完全脫鉤
- 設計師拿到的是「另一個系統」而非「現有系統的新功能」
- 元件請求（card、modal、form）卻生成整頁 HTML，無法直接複用

## What Changes

- 新增「平台 Shell」概念：專案設定中可定義現有系統的框架 HTML（nav、sidebar、header、footer），作為所有生成的外殼
- 擴充 intent classifier：從 `generate | question` 擴充為 `full-page | in-shell | component | question`
- 生成路徑依 intent 分叉：
  - `full-page` → 現有邏輯（完整 HTML）
  - `in-shell` → 將生成內容嵌入 platform shell，輸出完整 HTML
  - `component` → 只輸出元件 HTML/CSS 片段，包在預覽用 wrapper 中
- Platform Shell 可從現有已生成原型中一鍵擷取，也可手動貼上 HTML
- 生成 prompt 依 intent 注入不同指令，告知 AI 它在生成什麼層次的內容

## Capabilities

### New Capabilities
- `platform-shell-management`: 儲存、擷取、預覽專案的 platform shell HTML
- `generation-intent-classification`: 四分類 intent 判斷（full-page / in-shell / component / question）
- `context-aware-generation`: 依 intent 與 shell 組合生成 prompt，決定輸出結構

### Modified Capabilities
<!-- 無現有 spec 需 MODIFIED -->

## Impact

- `packages/server/src/db/migrations/006_platform_shell.sql` — 新增 `platform_shells` 資料表
- `packages/server/src/routes/platformShell.ts` — GET/PUT/POST(extract) 端點
- `packages/server/src/services/intentClassifier.ts` — 擴充為四分類
- `packages/server/src/routes/chat.ts` — 依 intent 分叉生成邏輯
- `packages/client/src/components/DesignPanel.tsx` — 新增 Platform Shell section
- `packages/client/src/pages/WorkspacePage.tsx` — component 預覽用 wrapper
- 無 breaking changes：`full-page` intent 與現有行為完全相同
