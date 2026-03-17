## Context

Project Bridge 是全新的 greenfield 專案。目標是讓 PM 透過自然語言描述需求，AI 生成可互動的 HTML 原型。Phase 1 聚焦於核心功能：生成、修改、分享。

目前沒有任何既有程式碼、資料庫或基礎設施。部署目標為公司內部 server（Node.js runtime）。

## Goals / Non-Goals

**Goals:**
- 建立可運作的前後端分離 Web 應用
- PM 可用自然語言描述需求並即時看到生成的 HTML 原型
- 支援對話式迭代修改，維持上下文
- 原型可透過連結分享給團隊成員
- 架構可擴展，為 Phase 2-4 打下基礎

**Non-Goals:**
- 使用者認證/帳號系統
- 檔案上傳解析（PDF/Word/PPT/圖片）— Phase 2
- 註解和規格面板 — Phase 2
- Gitea 整合 — Phase 3
- 直接編輯器、行為模擬 — Phase 4

## Decisions

### 1. Monorepo 結構

**決定**: 前後端放在同一個 repo，使用 `packages/` 目錄結構。

```
project-bridge/
├── packages/
│   ├── client/          # React app (Vite)
│   └── server/          # Express API
├── package.json         # Workspace root
└── openspec/
```

**理由**: 單一 repo 方便管理，共享 TypeScript 型別定義，簡化 CI/CD。
**替代方案**: 分開兩個 repo — 增加同步成本，對小團隊不划算。

### 2. 前端框架：React + Vite

**決定**: 使用 React 18 + Vite 作為前端建置工具。

**理由**: React 生態成熟、元件庫豐富；Vite 開發體驗快，HMR 即時。
**替代方案**: Next.js — SSR 在此場景不必要，增加複雜度。Vue — 也可行但 React 社群資源更多。

### 3. 後端框架：Express + TypeScript

**決定**: Express.js 搭配 TypeScript。

**理由**: 輕量、靈活、成熟穩定。SSE streaming 支援良好。
**替代方案**: Fastify — 效能更好但生態較小；NestJS — 過度工程化。

### 4. 資料庫：better-sqlite3

**決定**: 使用 better-sqlite3（同步 API 的 SQLite 綁定）。

**理由**: 零配置部署，不需要額外 DB server。同步 API 比 async SQLite 更簡單且效能更好。公司內部使用，不需要高併發。
**替代方案**: PostgreSQL — 需要額外部署 DB server；SQLite3 (async) — API 較麻煩。

### 5. AI 串流：OpenAI API + SSE

**決定**: 後端作為 OpenAI API 的串流代理，透過 Server-Sent Events (SSE) 把生成內容即時推送到前端。

**流程**:
1. 前端 POST `/api/projects/:id/chat` 帶 message body
2. 後端組裝 prompt（system prompt + 對話歷史 + 新訊息）
3. 呼叫 OpenAI API（stream: true）
4. 逐 chunk 透過 SSE 轉發給前端
5. 完成後存入 Conversation + PrototypeVersion

**理由**: PM 可即時看到生成過程，體驗更好。SSE 比 WebSocket 簡單且適合單向串流。
**替代方案**: WebSocket — 雙向但此處不需要；輪詢 — 體驗差。

### 6. 原型渲染：sandboxed iframe

**決定**: 生成的 HTML 透過 `srcdoc` 屬性注入 sandboxed iframe。

**sandbox 設定**: `sandbox="allow-scripts"` — 允許 JS 執行但隔離 origin。

**理由**: 安全隔離、不影響主應用、支援完整的 HTML/CSS/JS 互動。
**替代方案**: Shadow DOM — 隔離不夠完整；新視窗 — 使用者體驗差。

### 7. Prompt 策略

**決定**: System prompt 指示 AI 生成單檔 HTML，包含 inline CSS/JS，使用語義化 class name，為所有互動元素添加 `data-bridge-id` 屬性。

**上下文管理**: 滑動視窗保留最近 20 則訊息，超過的用摘要取代。

**理由**: `data-bridge-id` 為 Phase 2 的註解系統做準備。滑動視窗平衡上下文品質和 token 成本。

## Risks / Trade-offs

- **AI 生成品質不穩定** → 透過精心設計的 system prompt 和 few-shot examples 提升品質。允許 PM 透過對話迭代修正。
- **SQLite 單寫者限制** → 公司內部使用，併發低，不成問題。Phase 4 如需更高併發再考慮遷移。
- **OpenAI API 費用** → 使用 GPT-4o-mini 作為預設模型平衡品質和成本，允許設定中切換模型。
- **sandboxed iframe 互動限制** → Phase 1 只需預覽，不需要和 iframe 互動。Phase 2 起用 postMessage 溝通。
- **單檔 HTML 的規模限制** → 對於複雜原型，單檔可能很大。但 Phase 1 聚焦 MVP，這是可接受的取捨。
