## Why

目前家用伺服器缺少一個統一的「個人知識庫」服務。日常累積的檔案（PDF、圖片、筆記）散落各處，無法被 AI 統一檢索和理解。同時也沒有一個私密的日記系統能與 AI 深度整合。Smart Vault 要解決的是：把所有個人資料集中管理，讓 AI 能跨檔案、跨時間地理解和回答問題。

## What Changes

- 建立全新獨立服務 `smart-vault`，獨立 monorepo（packages/server + packages/web）
- 檔案上傳系統：支援 PDF、圖片、文字檔，上傳後自動用 Gemini 2.5 Flash 分析內容、生成摘要
- RAG 對話系統：AI 對話時自動檢索相關檔案內容作為上下文
- 全文模糊搜尋：跨所有檔案和日記的中文友好模糊搜尋
- 私密日記功能：每日日記撰寫，AI 可參考日記回答問題
- 跨檔案記憶：AI 維護長期記憶，跨對話保持上下文連續性
- 複用 project-bridge 的 api-key-pool 設計模式（geminiKeys / geminiRetry / cooldown / usage tracking）
- Docker 部署於 RPi，port 8823，整合 Caddy reverse proxy

## Capabilities

### New Capabilities
- `file-management`: 檔案上傳、儲存、自動分析（Gemini 提取摘要與關鍵字）、檔案列表與刪除
- `ai-chat`: RAG 架構的 AI 對話，自動檢索相關檔案/日記內容作為上下文回答
- `fuzzy-search`: 跨檔案、跨日記的全文模糊搜尋，支援中文
- `diary`: 私密日記 CRUD，按日期瀏覽，AI 可存取日記內容
- `cross-file-memory`: AI 長期記憶系統，跨對話持久化重要上下文與事實
- `api-key-pool`: 複用 project-bridge 的 Gemini API key pool 設計（多 key 輪換、cooldown、usage tracking）

### Modified Capabilities
（無，此為全新獨立服務）

## Impact

- **新增代碼庫**：`smart-vault/` 獨立 monorepo，不修改 project-bridge 原始碼（僅參考其 pattern）
- **RPi 資源**：新增一個 Docker container，佔用 port 8823
- **Caddy 設定**：需新增 `vault.sisihome.org` 反向代理規則
- **Pi-hole**：wildcard DNS 已涵蓋 `*.sisihome`，無需額外設定
- **依賴**：@google/generative-ai、better-sqlite3、multer、pdf-parse、sharp、tesseract.js
