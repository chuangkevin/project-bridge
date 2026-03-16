## Why

PM 寫的規格文件，工程師常常看不懂或理解有落差，導致反覆溝通浪費時間。需要一個工具讓 PM 用自然語言描述需求後，立即生成可互動的 HTML 原型，並透過連結分享給團隊成員，讓所有人對「要做什麼」有一致的視覺理解。Phase 1 建立核心可用的最小產品。

## What Changes

- 建立全新的 Web 應用（React 前端 + Node.js/Express 後端）
- 實作專案 CRUD 管理
- 實作對話式介面，PM 用自然語言輸入需求（支援純文字和 Markdown）
- 整合 OpenAI API（串流），根據 PM 描述生成單檔 HTML/CSS/JS
- 在 sandboxed iframe 中預覽可互動原型
- 支援對話式修改（維持上下文，迭代生成）
- 透過唯一連結分享原型（唯讀預覽頁）
- SQLite 儲存專案資料，檔案系統儲存生成的 HTML

## Capabilities

### New Capabilities
- `project-management`: 專案的建立、列表、更新、刪除，包含專案首頁 UI
- `ai-chat-generation`: 對話介面 + OpenAI API 串流整合，自然語言生成 HTML/CSS/JS 原型
- `prototype-preview`: sandboxed iframe 預覽生成的原型，支援裝置尺寸切換
- `share-prototype`: 透過唯一 token 產生分享連結，提供唯讀預覽頁

### Modified Capabilities

(None — this is a greenfield project)

## Impact

- **New codebase**: 前端 React app + 後端 Express server，需建立完整的專案結構
- **Dependencies**: React, Express, SQLite (better-sqlite3), OpenAI SDK, uuid
- **APIs**: 新增 REST API endpoints（projects CRUD, chat SSE, share）
- **Infrastructure**: 需要 Node.js runtime 部署在公司 server，需設定 OpenAI API key
