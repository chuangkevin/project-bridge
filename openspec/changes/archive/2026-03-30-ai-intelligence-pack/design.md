## Context

Project Bridge 是一個 AI 驅動的原型生成工具，使用 React + Express + SQLite + Gemini API 架構。目前系統直接呼叫 Gemini API 進行原型生成，缺乏佇列管理、品質控制、智慧輔助等機制。本設計涵蓋六項新功能的技術架構與實作方式。

現有架構：
- 前端：React SPA，使用 React Router，元件位於 `client/src/components/`
- 後端：Express.js，路由位於 `server/routes/`，資料庫為 SQLite
- AI 整合：透過 Gemini API 進行原型 HTML 生成
- 認證：使用 bridge_token session 機制，區分 admin 與一般使用者

## Goals / Non-Goals

**Goals:**
- 透過 AI 推薦降低使用者設定 API 綁定的門檻
- 建立可擴展的領域知識（Skill）注入機制
- 提供生成品質的量化指標
- 透過模板庫加速常見場景的提示詞撰寫
- 自動產生可匯出的設計規格文件
- 確保多人同時使用時的系統穩定性

**Non-Goals:**
- 不實作分散式佇列（不使用 Redis/RabbitMQ）
- 不支援 skill 的版本控制
- 不實作即時協作功能
- 品質評分不作為生成失敗/重試的自動觸發條件
- 不支援 PDF 匯出的複雜排版（使用簡單 HTML-to-PDF 轉換）

## Decisions

### D1: Skill 觸發機制 — AI Agent 決策 + 關鍵字優先

**選擇**：AI Agent 分析使用者輸入決定相關 skills，關鍵字匹配的 skills 獲得優先權。

**替代方案**：
- 純關鍵字匹配：簡單但不夠智慧，容易漏掉語意相關的 skills
- 純 AI 判斷：靈活但不可預測，管理員無法確保特定 skills 被觸發

**理由**：混合方式兼顧可預測性與智慧性。關鍵字匹配提供確定性保障，AI 判斷補充語意理解。當多個 skills 衝突時，AI Agent 從關鍵字匹配的 skills 中優先選擇最相關的。

**實作方式**：
1. 從 DB 載入所有 skills（按 scope 過濾：global + 當前專案）
2. 先做關鍵字匹配，標記命中的 skills
3. 將使用者輸入 + skills 清單（含關鍵字命中標記）送給 Gemini，請 AI 選擇最相關的 skills（上限 3 個）
4. 關鍵字命中的 skills 在 AI 選擇提示中標記為「建議優先」

### D2: 品質評分 — 非同步獨立呼叫

**選擇**：生成完成後，以獨立的 Gemini API 呼叫進行品質評分，非同步執行不阻塞使用者。

**替代方案**：
- 同步評分：使用者需等待更久
- 前端評分：無法評估語意層面的品質

**理由**：品質評分是輔助資訊，不應影響使用者體驗。非同步方式讓使用者立即看到生成結果，評分稍後更新。

**實作方式**：
- 生成完成後將評分任務加入佇列（與生成佇列共用）
- 評分結果儲存至 generation_versions 表的 quality_score 欄位（JSON 格式）
- 前端透過輪詢或 WebSocket 更新評分顯示

### D3: 佇列系統 — 記憶體內佇列

**選擇**：使用 Node.js 記憶體內佇列，不依賴外部服務。

**替代方案**：
- Redis + Bull Queue：可靠但增加部署複雜度
- 資料庫佇列：持久但效能較差

**理由**：Project Bridge 為內部工具，重啟時丟失佇列可接受。記憶體佇列零外部依賴，部署簡單。並行數根據可用 API key 數量設定。

**實作方式**：
- 佇列類別：GenerationQueue，管理任務排序與並行執行
- 可設定 concurrency（預設：API key 數量）
- 任務狀態：pending → processing → completed/failed
- 前端顯示佇列位置與預估等待時間（基於平均生成時間 × 前方任務數）

### D4: API 推薦 — 頁面上下文分析

**選擇**：將頁面 HTML + 元素資訊 + 現有標註傳送給 Gemini，推薦 API schema。

**實作方式**：
- 使用者點擊「AI 推薦」按鈕
- 前端收集：當前頁面 HTML、選中元素資訊、已有的標註與約束
- 後端呼叫 Gemini，提示詞要求推薦 request/response JSON schema
- 回傳推薦結果，使用者可接受或修改

### D5: 提示詞模板 — 系統預設 + 自訂

**選擇**：系統內建模板 + 管理員自訂模板，存於資料庫。

**實作方式**：
- 系統模板以 seed data 方式初始化（is_system = true）
- 管理員可建立自訂模板（is_system = false）
- 模板支援變數佔位符（如 `{{page_name}}`），使用者選擇後填入變數
- 前端在 ChatInput 旁顯示模板選擇器

### D6: 設計規格文件匯出

**選擇**：後端組裝資料，Gemini 整理格式，輸出 Markdown。PDF 由 Markdown 轉換。

**實作方式**：
- 收集資料：頁面清單、元素規格、標註、約束、API 綁定、設計 token
- 呼叫 Gemini 組織成結構化 PRD 文件
- Markdown 直接回傳；PDF 使用 puppeteer 或類似套件從 Markdown HTML 轉換

## 資料庫變更

### 新增表：skills
```sql
CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  triggers TEXT NOT NULL,  -- JSON array of keywords
  content TEXT NOT NULL,   -- Markdown content
  scope TEXT NOT NULL DEFAULT 'global',  -- 'global' | 'project'
  project_id TEXT,         -- nullable, set when scope='project'
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 新增表：prompt_templates
```sql
CREATE TABLE prompt_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,  -- 'form' | 'dashboard' | 'landing' | 'list' | 'detail' | 'other'
  content TEXT NOT NULL,   -- Template content with {{variable}} placeholders
  is_system INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 修改表：generation_versions（或對應版本歷史表）
```sql
ALTER TABLE generation_versions ADD COLUMN quality_score TEXT;  -- JSON: {html: number, a11y: number, responsive: number, design: number, overall: number}
```

## Risks / Trade-offs

- **[記憶體佇列重啟丟失]** → 可接受，內部工具重啟頻率低，重啟後使用者重新提交即可
- **[Gemini API 用量增加]** → 品質評分與 API 推薦各增加一次 API 呼叫。可透過佇列並行控制限制整體呼叫速率
- **[Skill 注入增加 token 用量]** → 限制每次最多注入 3 個 skills，並限制單一 skill 內容長度（建議上限 2000 字）
- **[品質評分準確性]** → AI 評分可能不完全客觀，但作為參考指標已足夠。未來可加入規則式檢查（如 HTML validator）
- **[PDF 匯出品質]** → 簡單 HTML-to-PDF 轉換，不追求精美排版。若需求升級再引入專業 PDF 套件

## Open Questions

- 品質評分的各維度權重是否需要可配置？（暫定等權重）
- 是否需要 skill 的啟用/停用開關？（暫定有，透過 is_active 欄位）
- 模板變數的驗證機制是否需要？（暫定前端簡單提示，不做強制驗證）
