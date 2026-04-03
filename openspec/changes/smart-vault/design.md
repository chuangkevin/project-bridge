## Context

Smart Vault 是一個全新的獨立服務，目標是成為個人知識庫 + AI 助手 + 私密日記的統合平台。目前 RPi 上已有 project-bridge 使用 Gemini API key pool 的成熟設計，Smart Vault 將複用此 pattern 但作為獨立 codebase。

現有基礎設施：Caddy reverse proxy、Pi-hole wildcard DNS、Docker Compose 部署流程皆已就緒，新增服務只需加入 Caddyfile 規則和部署 container。

## Goals / Non-Goals

**Goals:**
- 統一的檔案上傳 + AI 分析管線（PDF/圖片/文字 → 摘要 + 全文索引）
- RAG 對話：AI 回答問題時自動檢索相關檔案與日記內容
- 高品質中文模糊搜尋（跨檔案 + 跨日記）
- 私密日記系統，與 AI 深度整合
- AI 長期記憶，跨對話維持上下文
- 複用 project-bridge 的 api-key-pool pattern，支援多 key 輪換

**Non-Goals:**
- 不做多用戶認證系統（單用戶，Tailscale 網路已提供存取控制）
- 不做檔案版本控制或協作編輯
- 不做即時同步或 WebSocket 推送（polling 即可）
- 不整合外部雲端儲存（僅本地 SQLite + 檔案系統）
- 不做向量資料庫（用 Gemini 的長 context window 取代傳統 embedding RAG）

## Decisions

### 1. RAG 策略：Context Stuffing vs Vector DB

**選擇**：Context Stuffing（直接把相關文檔塞進 Gemini prompt）

**理由**：
- Gemini 2.5 Flash 有 1M token context window，足以容納大量文檔片段
- 省去 vector DB 的部署與維護複雜度（不需要 ChromaDB/Qdrant 等）
- 搜尋用 SQLite FTS5 做初步篩選，再把 top-N 結果塞入 prompt
- 替代方案：pgvector / ChromaDB — 增加部署複雜度，RPi 資源有限

### 2. 搜尋引擎：SQLite FTS5

**選擇**：SQLite FTS5 + ICU tokenizer（中文支援）

**理由**：
- 零額外依賴，better-sqlite3 原生支援 FTS5
- ICU tokenizer 支援中文分詞，適合中文模糊搜尋
- RPi 資源有限，不適合跑 Elasticsearch/MeiliSearch
- 替代方案：MeiliSearch — 搜尋品質更好但多一個 container

### 3. 檔案處理管線

**選擇**：上傳 → 儲存原檔 → 非同步分析（Gemini）→ 儲存摘要與全文至 DB

**理由**：
- 非同步處理避免上傳超時（大 PDF 分析可能需要 10+ 秒）
- 原檔存檔案系統（`data/uploads/`），metadata 和全文存 SQLite
- PDF 用 pdf-parse 提取文字，圖片用 Gemini Vision 直接分析
- sharp 做圖片壓縮（RPi 記憶體有限）

### 4. 記憶系統設計

**選擇**：顯式記憶表 + AI 自動提取

**理由**：
- 每次對話結束後，AI 自動從對話中提取重要事實存入 `memories` 表
- 新對話開始時，載入最近 N 條記憶 + 搜尋相關記憶作為 system prompt
- 記憶有 relevance score，定期衰減不常用的記憶
- 替代方案：全對話歷史存檔 — token 消耗太大，不實際

### 5. Monorepo 結構

**選擇**：`packages/server` + `packages/web`，與 project-bridge 相同結構

**理由**：
- 團隊（個人）已熟悉此結構
- 共用 build/dev scripts
- Docker 單一 image 包含前後端

### 6. API Key Pool 複用策略

**選擇**：從 project-bridge 複製 geminiKeys.ts + geminiRetry.ts，適配新 DB

**理由**：
- 直接複製而非引用，因為是獨立 codebase
- 保留完整功能：多 key 隨機選取、cooldown 持久化、usage tracking、withGeminiRetry
- 前端同樣複用 key 管理 UI（新增/驗證/查看用量）

## Risks / Trade-offs

- **FTS5 ICU tokenizer 可能不在 RPi 預設 SQLite 中** → 使用 better-sqlite3 編譯時啟用 ICU，或改用 simple tokenizer + trigram 做中文搜尋
- **大檔案上傳佔用 RPi 有限的儲存空間** → 設定單檔上限 50MB，總容量可在設定中調整
- **Gemini 分析大量檔案時 API 配額消耗快** → api-key-pool 多 key 輪換 + cooldown 機制已處理
- **Context stuffing 在檔案非常多時會超出 token 限制** → 用 FTS5 預篩選，只送 top-10 相關片段進 prompt
- **RPi ARM64 上 tesseract.js 可能較慢** → 圖片優先用 Gemini Vision，tesseract 作為 fallback

## Migration Plan

1. 在本機開發完成，建立 Docker image（multi-stage build，支援 arm64）
2. 推送 image 至 RPi 或在 RPi 上直接 build
3. 建立 `/home/kevin/DockerCompose/smart-vault/docker-compose.yml`
4. 更新 Caddyfile：新增 `vault.sisihome.org` → `localhost:8823`
5. 重啟 Caddy
6. 驗證 HTTPS 存取正常
