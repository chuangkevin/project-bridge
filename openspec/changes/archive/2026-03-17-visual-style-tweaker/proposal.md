## Why

生成的原型雖然可以透過 AI Prompt 調整風格，但每次小修改（換個顏色、調圓角）都要重新生成，費時且不直覺。使用者需要一個「所見即所得」的方式，能直接在預覽畫面旁即時調整視覺細節。

## What Changes

- 新增「樣式微調」面板（StyleTweaker），在 WorkspacePage 右側 AI 面板區顯示
- 自動解析當前原型 HTML，偵測 CSS 變數（`--primary-color`、`--font-family`、`--border-radius` 等）及常見 inline 顏色值
- 提供色票、滑桿、下拉等控制項，讓使用者即時修改偵測到的樣式值
- 所有變更透過 postMessage 注入 iframe，預覽即時更新，無需重新生成
- 新增「儲存樣式」按鈕，將調整後的 CSS 覆蓋合併回當前原型版本 HTML，存入資料庫

## Capabilities

### New Capabilities
- `css-variable-extraction`: 從原型 HTML 解析 CSS 變數與常見顏色宣告，產出可編輯的樣式 token 清單
- `live-style-injection`: 透過 iframe postMessage 即時將樣式變更注入預覽，無需重新整理
- `style-tweaker-panel`: WorkspacePage 中的樣式微調 UI，含色票、滑桿、下拉控制項及儲存功能

### Modified Capabilities
<!-- 無現有 spec 需變更 -->

## Impact

- `packages/client/src/pages/WorkspacePage.tsx` — 新增 StyleTweaker panel tab 或側欄
- `packages/client/src/components/StyleTweakerPanel.tsx` — 新元件
- `packages/client/src/utils/cssExtractor.ts` — HTML CSS 變數解析工具
- `packages/client/src/utils/bridgeScript.ts` — 新增 `inject-styles` postMessage handler
- `packages/server/src/routes/prototypes.ts` — 新增 `PATCH /api/projects/:id/prototype/styles` 端點，將樣式覆蓋合併進當前版本 HTML
- 無 breaking changes，不影響現有 AI 生成流程
