## Context

Project Bridge 是一個以 React + Express + SQLite + Gemini API 構建的 AI 原型生成工具。目前架構為單體應用，前後端透過 REST API 溝通，無 WebSocket 支援。使用者各自獨立操作專案，無法得知其他人是否同時在瀏覽或編輯同一專案。

現有架構：
- 伺服器：Express（`packages/server/src/index.ts`），路由定義於 `routes/`，業務邏輯於 `services/`
- 前端：React + Vite（`packages/client/src/`），使用 context 管理狀態
- 資料庫：SQLite，透過 `db/` 模組存取
- 部署：Docker + Docker Compose，經由反向代理對外服務

## Goals / Non-Goals

**Goals:**
- 讓多位使用者能即時在同一專案中協作，包含游標同步、在線狀態顯示、標注同步
- 避免 AI 生成操作的衝突（同一時間僅允許一人觸發生成）
- 提供 Figma 匯出端點，輸出 Figma Plugin API 相容的中間 JSON 格式
- 將 Socket.io 無縫整合至現有 Express 伺服器，不需額外部署獨立服務

**Non-Goals:**
- 不實作 Figma Plugin 本身（獨立專案，不在本次範圍內）
- 不實作 CRDT 或 OT 等複雜的即時文件協同編輯演算法
- 不實作使用者驗證/授權系統（沿用現有機制）
- 不產出 `.fig` 二進位檔案（Figma 格式為私有格式）
- 不支援跨專案協作或全域聊天

## Decisions

### 1. WebSocket 框架：Socket.io

**選擇：** Socket.io
**替代方案：** 原生 WebSocket（ws 套件）、Server-Sent Events（SSE）

**理由：**
- Socket.io 內建房間管理（`join`/`leave`），完美對應「每個專案一個房間」的需求
- 內建自動重連機制，前端斷線後自動恢復
- 自動降級至 HTTP long-polling（當 WebSocket 不可用時）
- 豐富的生態系與文件，降低維護成本
- 原生 WebSocket 需自行實作房間、重連、心跳等基礎設施
- SSE 為單向通訊，不適合雙向即時互動

### 2. 游標同步策略：節流廣播

**選擇：** 前端 50ms 節流 + 伺服器直接廣播至房間其他成員
**替代方案：** 伺服器端節流、不節流

**理由：**
- 前端節流減少上行流量，50ms（20fps）足以呈現流暢的游標移動
- 伺服器僅做轉發不做聚合，降低伺服器 CPU 負擔
- 游標位置為純展示資料，不需持久化，不需衝突處理

### 3. 標注同步策略：Last Write Wins + 樂觀更新

**選擇：** 用戶端樂觀更新 → 送出變更至伺服器 → 伺服器寫入 DB 並廣播
**替代方案：** CRDT、Operational Transform

**理由：**
- 標注為獨立物件（各有獨立 ID），不同使用者同時編輯同一標注的機率極低
- Last Write Wins 實作簡單、可靠，適合低碰撞場景
- CRDT/OT 複雜度高，對本場景而言過度工程化
- 樂觀更新確保本地操作無延遲感

### 4. AI 生成鎖定：伺服器端互斥鎖

**選擇：** 每個專案一個記憶體內鎖定，紀錄持有者與取得時間
**替代方案：** 資料庫鎖定、佇列系統

**理由：**
- AI 生成為耗時操作（數秒至數十秒），必須避免重複觸發
- 記憶體內鎖定即可（單一伺服器部署），無需 Redis
- 設定 5 分鐘自動釋放超時，防止鎖定洩漏（使用者斷線或生成異常）
- 鎖定狀態透過 WebSocket 廣播，其他使用者即時看到提示

### 5. Figma 匯出格式：中間 JSON

**選擇：** 輸出 Figma Plugin API 相容的 JSON 結構
**替代方案：** 直接生成 .fig 檔案、輸出 SVG

**理由：**
- Figma .fig 格式為私有二進位格式，無官方文件
- Figma Plugin API 提供 `figma.createNodeFromSvg()`、`figma.createFrame()` 等方法，接受結構化資料
- 我們輸出 JSON 描述節點樹（Document → Page → Frame → 子節點），由未來的 Figma Plugin 讀取並建立
- JSON 格式可讀、可測試、可版控

### 6. Socket.io 整合方式

**選擇：** 共用現有 Express 的 HTTP Server 實例
**替代方案：** 獨立啟動另一個 port

**理由：**
- 共用 server 實例避免 CORS 問題與額外 port 管理
- `const io = new Server(httpServer)` 即可整合
- 部署時只需確保反向代理支援 WebSocket upgrade

## 架構概覽

```
┌─────────────────────────────────────────┐
│              前端 (React)                │
│                                         │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │ CollabContext│  │ SocketProvider   │  │
│  │ - cursors   │  │ - connection     │  │
│  │ - presence  │  │ - room mgmt     │  │
│  │ - genLock   │  │ - event binding │  │
│  └─────────────┘  └──────────────────┘  │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │ CursorLayer │  │ PresenceBar     │  │
│  │ (overlay)   │  │ (header)        │  │
│  └─────────────┘  └──────────────────┘  │
└────────────┬────────────────────────────┘
             │ Socket.io Client
             ▼
┌─────────────────────────────────────────┐
│           伺服器 (Express + Socket.io)   │
│                                         │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │SocketHandler│  │ REST Routes      │  │
│  │ - rooms     │  │ - export-figma   │  │
│  │ - cursors   │  │                  │  │
│  │ - presence  │  │                  │  │
│  │ - annotSync │  │                  │  │
│  │ - genLock   │  │                  │  │
│  └─────────────┘  └──────────────────┘  │
│                                         │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │ GenLockMgr  │  │ FigmaExportSvc   │  │
│  │ (in-memory) │  │ HTML→JSON parse  │  │
│  └─────────────┘  └──────────────────┘  │
└─────────────────────────────────────────┘
```

## Socket 事件設計

| 事件名稱 | 方向 | 資料 |
|---------|------|------|
| `join-room` | Client → Server | `{ projectId, user: { id, name } }` |
| `leave-room` | Client → Server | `{ projectId }` |
| `presence-update` | Server → Client | `{ users: [{ id, name, color }] }` |
| `cursor-move` | Client → Server → Others | `{ x, y, userId }` |
| `annotation-change` | Client → Server → Others | `{ action, annotation }` |
| `generation-lock` | Client → Server | `{ projectId, action: 'acquire'|'release' }` |
| `generation-lock-update` | Server → Client | `{ locked, lockedBy: { id, name } }` |

## Risks / Trade-offs

- **[風險] 單伺服器記憶體鎖定不支援水平擴展** → 目前為單體部署，短期可接受。未來若需擴展，可遷移至 Redis 鎖定 + Socket.io Redis Adapter
- **[風險] WebSocket 連線被反向代理截斷** → 部署文件需更新 Nginx/Traefik 設定，確保 `Upgrade` header 正確轉發
- **[風險] 使用者異常斷線導致生成鎖定殘留** → 5 分鐘超時自動釋放 + `disconnect` 事件清理
- **[取捨] Last Write Wins 可能在極端情況下丟失標注修改** → 機率極低（需兩人同時編輯同一標注），可接受
- **[取捨] Figma 匯出精確度受限於 HTML 解析能力** → 複雜 CSS 佈局可能無法完美轉換，輸出「近似」結構而非「完美還原」
- **[風險] Socket.io 新增依賴增加 bundle 大小** → socket.io-client 約 40KB gzipped，可接受

## Open Questions

- 是否需要協作編輯的操作歷史記錄（undo/redo across users）？目前設計不包含
- Figma 匯出是否需要支援原型互動連結（prototype links between frames）？初期可選擇性支援
