## 1. Project Scaffolding

- [ ] 1.1 建立 smart-vault monorepo 根目錄，初始化 package.json、tsconfig.json、.gitignore
- [ ] 1.2 建立 packages/server 結構：src/、tsconfig.json、package.json（express, better-sqlite3, multer, pdf-parse, sharp, @google/generative-ai）
- [ ] 1.3 建立 packages/web 結構：Vite + React + TypeScript 初始化
- [ ] 1.4 建立 Docker 相關檔案：Dockerfile（multi-stage, arm64）、docker-compose.yml（port 8823）、.dockerignore

## 2. Database & Migrations

- [ ] 2.1 建立 SQLite 連線模組（better-sqlite3, WAL mode）與 migration runner
- [ ] 2.2 建立 files 表：id, filename, original_name, mime_type, size, status, summary, full_text, tags, created_at
- [ ] 2.3 建立 diary_entries 表：id, date (unique), title, content, created_at, updated_at
- [ ] 2.4 建立 chat_sessions 表：id, title, created_at, updated_at
- [ ] 2.5 建立 chat_messages 表：id, session_id, role, content, created_at
- [ ] 2.6 建立 memories 表：id, content, source_session_id, created_at, updated_at
- [ ] 2.7 建立 FTS5 虛擬表：files_fts (full_text, summary, tags)、diary_fts (title, content)、memories_fts (content)
- [ ] 2.8 建立 api_key_cooldowns 表與 api_key_usage 表（複用 project-bridge schema）
- [ ] 2.9 建立 settings 表（儲存 API keys 等設定）

## 3. API Key Pool

- [ ] 3.1 從 project-bridge 複製並適配 geminiKeys.ts（loadKeys, getAvailableKeys, markKeyBad, cooldown 持久化）
- [ ] 3.2 從 project-bridge 複製並適配 geminiRetry.ts（withGeminiRetry, error classification, auto-retry）
- [ ] 3.3 建立 API key 管理路由：GET/POST/DELETE /api/settings/api-keys、POST /api/settings/validate-key
- [ ] 3.4 建立 usage tracking 函式（trackUsage）與 usage stats 查詢 API

## 4. File Management

- [ ] 4.1 建立檔案上傳 API：POST /api/files（multer middleware, 50MB limit, 格式驗證）
- [ ] 4.2 建立檔案儲存邏輯：存至 data/uploads/，以 UUID 重命名
- [ ] 4.3 建立非同步分析管線：PDF → pdf-parse 提取文字 → Gemini 摘要/標籤；圖片 → sharp 壓縮 → Gemini Vision 分析；文字 → 直接 Gemini 摘要
- [ ] 4.4 建立檔案 CRUD API：GET /api/files（分頁、篩選）、GET /api/files/:id、DELETE /api/files/:id
- [ ] 4.5 上傳/分析完成後寫入 FTS5 索引

## 5. Diary

- [ ] 5.1 建立日記 CRUD API：POST /api/diary、PUT /api/diary/:date、GET /api/diary/:date、DELETE /api/diary/:date
- [ ] 5.2 建立日記列表 API：GET /api/diary（分頁、日期範圍篩選）
- [ ] 5.3 建立日記月曆 API：GET /api/diary/calendar/:yearMonth（回傳該月有日記的日期）
- [ ] 5.4 日記寫入/更新時同步 FTS5 索引

## 6. Fuzzy Search

- [ ] 6.1 建立統一搜尋 API：GET /api/search?q=&filter=&page=&limit=
- [ ] 6.2 實作 FTS5 查詢邏輯：跨 files_fts + diary_fts 搜尋，合併結果按 relevance 排序
- [ ] 6.3 實作 snippet 高亮：使用 FTS5 snippet() 函式，用 `<mark>` 標記匹配詞
- [ ] 6.4 支援 filter 參數：files / diary / all

## 7. AI Chat (RAG)

- [ ] 7.1 建立 chat session CRUD API：POST /api/chat/sessions、GET /api/chat/sessions、DELETE /api/chat/sessions/:id
- [ ] 7.2 建立聊天訊息 API：POST /api/chat/sessions/:id/messages（SSE streaming response）
- [ ] 7.3 實作 RAG 檢索邏輯：用 user message 查詢 FTS5 取 top-10 相關 file excerpts + diary entries
- [ ] 7.4 實作 prompt 組裝：system prompt + memories + RAG context + conversation history + user message
- [ ] 7.5 實作 SSE streaming：使用 Gemini generateContentStream，逐 token 推送
- [ ] 7.6 實作自動生成 session title（首則訊息後用 Gemini 生成）

## 8. Cross-File Memory

- [ ] 8.1 建立記憶提取邏輯：對話 5+ 訊息後，用 Gemini 提取重要事實存入 memories 表
- [ ] 8.2 實作記憶檢索：新對話載入最近 10 條 + FTS5 搜尋相關記憶
- [ ] 8.3 實作記憶去重：用 Gemini 判斷新記憶與既有記憶是否重複，重複則更新時間戳
- [ ] 8.4 建立記憶管理 API：GET /api/memories、DELETE /api/memories/:id、GET /api/memories/search?q=

## 9. Frontend - Layout & Navigation

- [ ] 9.1 建立主要 Layout：側邊欄導航（檔案、對話、日記、搜尋、記憶、設定）
- [ ] 9.2 設定 React Router：/ (dashboard), /files, /chat, /diary, /search, /memories, /settings
- [ ] 9.3 建立共用元件：Loading、Empty State、Pagination、Confirm Dialog

## 10. Frontend - File Management

- [ ] 10.1 建立檔案列表頁面：卡片式顯示，含縮圖/圖示、名稱、摘要、標籤、分析狀態
- [ ] 10.2 建立檔案上傳元件：拖拽上傳 + 點擊上傳，顯示上傳進度
- [ ] 10.3 建立檔案詳情頁面：完整摘要、全文、標籤、原檔下載

## 11. Frontend - AI Chat

- [ ] 11.1 建立對話列表側欄 + 新增對話按鈕
- [ ] 11.2 建立聊天介面：訊息氣泡、Markdown 渲染、streaming 顯示
- [ ] 11.3 建立輸入框元件：支援 Enter 送出、Shift+Enter 換行

## 12. Frontend - Diary

- [ ] 12.1 建立日記月曆視圖：顯示哪些日期有日記，點擊日期開啟
- [ ] 12.2 建立日記編輯器：Markdown 編輯 + 預覽
- [ ] 12.3 建立日記列表視圖：時間軸式瀏覽

## 13. Frontend - Search & Memory & Settings

- [ ] 13.1 建立搜尋頁面：搜尋框 + filter tabs + 結果列表（含高亮 snippet）
- [ ] 13.2 建立記憶管理頁面：記憶列表 + 搜尋 + 刪除
- [ ] 13.3 建立設定頁面：API key 管理 UI（新增/驗證/刪除/用量統計）

## 14. Deployment

- [ ] 14.1 完成 Dockerfile：multi-stage build（build web → build server → production image, arm64）
- [ ] 14.2 完成 docker-compose.yml：port 8823, volume mounts (data/, db/)
- [ ] 14.3 更新 Caddyfile：新增 vault.sisihome.org → localhost:8823 反向代理規則
- [ ] 14.4 部署到 RPi：build image、啟動 container、重啟 Caddy
- [ ] 14.5 E2E 驗證：HTTPS 存取、檔案上傳、對話、搜尋、日記功能
