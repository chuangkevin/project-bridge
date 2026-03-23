## Why

Project Bridge 目前是單人使用的原型生成工具。團隊協作場景下，多位設計師或工程師無法同時查看、標注同一個原型，導致溝通效率低落。此外，生成的原型缺乏匯出至主流設計工具（如 Figma）的管道，限制了產出物融入現有設計工作流的能力。本次變更引入即時協作與 Figma 匯出功能，讓 Project Bridge 從「單人工具」升級為「團隊協作平台」。

## What Changes

- 新增 WebSocket（Socket.io）即時協作伺服器，整合至現有 Express 應用
- 新增房間機制：每個專案對應一個協作房間，開啟同一專案的使用者自動加入
- 新增游標同步：即時顯示其他使用者的滑鼠位置，附帶名稱標籤與自動分配色彩
- 新增在線狀態列表：專案頁面 header 顯示目前在線的使用者（頭像/名稱）
- 新增標注即時同步：任何使用者新增/編輯/刪除標注時，其他人即時看到變化
- 新增 AI 生成鎖定機制：同一時間僅一位使用者可觸發 AI 生成，其他人看到「使用者 X 正在生成中...」提示
- 新增 Figma 匯出端點：`POST /api/projects/:id/export-figma`，將 HTML 原型解析為 Figma Plugin API 相容的中間 JSON 格式
- 前端新增協作 UI 元件（游標顯示、在線狀態列表、生成鎖定提示）

## Capabilities

### New Capabilities

- `realtime-collaboration`: 即時協作核心功能，涵蓋 WebSocket 連線管理、房間機制、游標同步、在線狀態廣播、標注同步、AI 生成鎖定
- `figma-export`: Figma 匯出功能，涵蓋 HTML 原型解析為結構化節點樹、匯出端點、Figma Plugin API 相容 JSON 格式輸出

### Modified Capabilities

（無需修改現有 spec 層級的需求）

## Impact

- **伺服器端**：`packages/server/src/index.ts` 需整合 Socket.io 伺服器；新增 socket 事件處理模組；新增 `/api/projects/:id/export-figma` 路由與服務
- **前端**：`packages/client/src/` 新增 Socket.io client 連線管理、協作相關 React 元件與 context
- **新增依賴**：`socket.io`（伺服器端）、`socket.io-client`（前端）
- **資料庫**：無 schema 變更（游標與在線狀態為記憶體內暫存資料）
- **API**：新增 1 個 REST 端點（Figma 匯出）；新增多個 WebSocket 事件
- **部署**：WebSocket 需確保反向代理（Nginx/Docker）支援 upgrade 連線
