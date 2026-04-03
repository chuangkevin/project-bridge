## Why

Figma AI 生成的 prototype 可以直接查看原始碼（React + Tailwind），讓使用者理解生成結果的結構，也方便工程師直接複製程式碼到專案中。目前 Project Bridge 只有 iframe preview，看不到生成的 HTML/CSS 原始碼，是明顯的功能缺口。

## What Changes

- 工作區新增「Code」分頁，與 Preview 並列（Preview | Code）
- Code view 顯示生成的 HTML 原始碼，支援語法高亮
- 支援按頁面切換查看（多頁面專案）
- 一鍵複製完整程式碼
- 支援搜尋（Ctrl+F）
- 檔案結構樹（類似 Figma 的 Files panel），展示多頁面的邏輯結構

## Capabilities

### New Capabilities
- `code-panel`: 工作區右側新增 Code 面板，顯示語法高亮的 HTML 原始碼，支援頁面切換、搜尋、複製
- `code-file-tree`: 檔案結構樹元件，展示多頁面的邏輯結構（類似 Figma Files panel），點擊節點跳到對應程式碼區段

### Modified Capabilities

## Impact

- **Client**: `WorkspacePage.tsx` — 新增 Code tab 和面板切換邏輯
- **Client**: 新增 `CodePanel.tsx` 和 `CodeFileTree.tsx` 元件
- **Dependencies**: 需要輕量級語法高亮 library（如 `prism-react-renderer` 或 `highlight.js`）
- **Server**: 無需改動，HTML 已存在於 prototype data 中
