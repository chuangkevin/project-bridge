## Why

生成的原型中，某些頁面品質不穩定（空白、跑版、內容不足）。目前系統的做法是 auto-retry 或放 fallback，但使用者無法參與品質決策。

借鏡 Superpowers 的 Visual Companion 概念 + Claude Code 的 Skeptical Memory 原則：**不讓 AI 單方面決定結果，讓使用者看到多個方案後自己選。**

核心理念：有疑慮的頁面不直接用第一版，自動生成 2-3 個替代方案讓使用者比對選擇，選完後還能繼續微調。

## What Changes

- **自動偵測疑慮頁面** — 三種觸發條件：QA lessons 標記過失敗、pre-assembly gate 失敗、使用者主動要求
- **替代方案生成** — 對疑慮頁面額外生成 2 個替代版本（帶不同 prompt 指引），共 3 版供選擇
- **方案選擇 UI** — 前端顯示 2-3 個 iframe 預覽，使用者點選一個，替換到原型裡
- **使用者主動觸發** — 在任何頁面上點「🔄 其他方案」按鈕，生成替代版本
- **lesson 注入替代方案** — 替代方案 prompt 帶上「上次問題是 XX」，避免重複犯錯

## Capabilities

### New Capabilities
- `variant-generation`: 對指定頁面生成 2 個替代 HTML 方案（不同 prompt 策略），連同原版共 3 個。每個方案是獨立的 sub-agent call，帶不同的創意指引。觸發條件：QA lesson 存在 / gate 失敗 / 使用者點「其他方案」
- `variant-selector-ui`: 前端顯示方案選擇介面 — 2-3 個 iframe 並排預覽，每個有標題和一句話描述。使用者點選後替換到原型，存為新版本。支援「其他方案」按鈕主動觸發
- `variant-lesson-integration`: 替代方案生成時自動注入 session lessons，prompt 明確說「上次這頁的問題是 XX，請用不同方式設計」

### Modified Capabilities
（無現有 spec 需修改）

## Impact

- `packages/server/src/services/parallelGenerator.ts` — 偵測疑慮頁面、生成替代方案
- `packages/server/src/routes/chat.ts` — SSE 推送方案選擇事件、處理使用者選擇回覆
- `packages/server/src/services/subAgent.ts` — 替代方案的差異化 prompt
- `packages/client/src/components/ChatPanel.tsx` — 方案選擇卡片 UI
- `packages/client/src/pages/WorkspacePage.tsx` — 頁面級「其他方案」按鈕
- `packages/client/src/components/PreviewPanel.tsx` — 多 iframe 預覽
