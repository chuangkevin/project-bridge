## Why

目前系統把幾乎所有對話都導向「全頁重新生成」。使用者在現有原型上說「加一個 tag」、「把標題改大」、「加上篩選功能」，系統卻整頁重做，浪費 API token 也毀掉已經滿意的頁面。

根因有二：
1. **Intent 分類太粗** — `hasGenerateKeywords` 裡「設計」「做」等常見字觸發 full-page，沒有考慮「已有原型 + 小幅修改」的場景
2. **Micro-adjust 只能改 CSS** — 現有 micro-adjust prompt 只支援樣式微調（顏色、字體、間距），無法「加一個元件」或「在某個卡片上加 tag」

使用者需要的是：**在現有頁面上精準地點選元件，然後用自然語言描述修改**，而不是每次都重新生成整頁。

## What Changes

- 改進 intent 分類邏輯 — 當已有原型時，精準區分「微調」vs「重新生成」vs「加功能」
- 新增「元件級微調」模式 — 使用者在 preview iframe 裡點選元件，系統標記選中元件的 data-bridge-id，然後在 chat 裡針對該元件做 AI 修改
- 強化 micro-adjust prompt — 不只改 CSS，也支援新增/刪除/替換 HTML 元素（如加 tag、加按鈕、加欄位）
- 利用現有 VisualEditor 基礎設施 — 已有元件選取、rect 計算、patch 機制

## Capabilities

### New Capabilities
- `element-targeted-adjust`: 使用者在 iframe 裡點選元件後，chat 輸入針對該元件的修改指令（「加一個 tag」「改成紅色」「加購物車按鈕」），AI 只修改選中元件的 HTML/CSS，不動其他部分
- `smart-intent-classification`: 改進 intent 分類 — 已有原型時，「加 tag」「改標題」走 micro-adjust，「做一個全新的網站」才走 full-page。支援三級：css-only（改樣式）、element-modify（改結構）、full-regenerate（重做）

### Modified Capabilities

（無現有 spec 需修改）

## Impact

- `packages/server/src/services/intentClassifier.ts` — 分類邏輯改進
- `packages/server/src/routes/chat.ts` — intent routing 邏輯、micro-adjust 路徑增強
- `packages/server/src/prompts/micro-adjust.txt` — prompt 支援 HTML 結構修改
- `packages/client/src/pages/WorkspacePage.tsx` — 元件選取 → chat 輸入的整合
- `packages/client/src/components/ChatPanel.tsx` — 顯示選中元件 context
- `packages/client/src/components/PreviewPanel.tsx` — 元件選取模式
- `packages/client/src/components/VisualEditor.tsx` — 復用選取機制
