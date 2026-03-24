## Why

使用者在 AI 生成 prototype 的等待過程中完全看不到進度，不知道 AI 正在做什麼。Figma AI 和 Claude 等競品都展示了「思考過程」（Reasoning/Thinking），讓等待體驗從黑箱變成透明。Gemini 2.5 Flash 支援 `thinkingConfig`，可以輸出思考 tokens，我們應該利用這個能力提升 UX。

## What Changes

- 啟用 Gemini thinking mode，將思考過程透過 SSE 串流到前端
- 前端新增「AI 思考過程」即時顯示面板，取代現有的空白等待畫面
- 生成過程拆分為可見階段：分析需求 → 規劃結構 → 生成程式碼 → 完成渲染
- SSE 事件新增 `thinking`、`phase`、`progress` 類型，alongside 現有的 `token` 和 `done`

## Capabilities

### New Capabilities
- `thinking-stream`: Gemini thinking tokens 串流輸出，透過 SSE 傳送 thinking 內容到前端
- `generation-phases`: 生成過程階段化顯示（分析、結構規劃、程式碼生成、渲染），每階段發送 phase 事件
- `thinking-ui`: 前端即時思考過程面板，顯示 AI reasoning、階段進度條、token 計數

### Modified Capabilities

## Impact

- **Server**: `packages/server/src/routes/chat.ts` — SSE 串流邏輯需重構，新增 thinking/phase 事件類型
- **Server**: Gemini API 呼叫加入 `thinkingConfig` 參數
- **Client**: `packages/client/src/components/ChatPanel.tsx` — 新增 thinking 顯示 UI
- **Client**: SSE 事件處理器需擴充支援新事件類型
- **Dependencies**: 無新增，Gemini SDK 已支援 thinking mode
