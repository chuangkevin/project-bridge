# DesignBridge 重做 — 系統設計規格

**日期**：2026-06-01
**狀態**：Brainstorm 完成，等使用者最終 review，下一步進 writing-plans
**範圍**：DesignBridge 全棧重做。Server + Client 重寫，只保留 v1.5 的 provider 路由 + skill 載入架構。
**前置決議**：取代並廢棄 [2026-05-26-ai-ui-compiler-redesign.md](2026-05-26-ai-ui-compiler-redesign.md)（已 revert 出 main）。

---

## 0. 摘要

把 DesignBridge 從 v1.5 的「混合三模式 + 散落 multi-agent」結構，整個重做成：

**3-mode AI 設計助理** = 顧問（consult）+ 架構（architect）+ 設計（design），共用同一份**跨模式記憶池**，由**標準 Claude Code skill / MCP 系統**驅動 AI 行為，可選**多角色合議制 thinking**（PM / 設計師 / 工程師 / 主持人），輸出 **Vue 3 + Tailwind SFC**。

**核心 thesis**：
> 記憶是第一公民、Skill 主動驅動、思考過程使用者看得到、產出工程師接得起來。

**不會做**：AST / IR / 編譯器路線（5/26 失敗已 revert）、UI library 整合、AI 自由幻想風格。

---

## 1. 核心概念與限制

### 1.1 產品定位

| 角色 | 主要動作 | 系統價值 |
|---|---|---|
| **PM**（主要） | 用文件 / 截圖 / 對話定義產品 | 不寫程式即可產 UI |
| **設計師** | 提供品牌 / 設計規範，管理 skills | 規則 first-class，不只是裝飾 |
| **工程師** | 拿 Vue SFC 接 API | 拿到接手得起來的 code，不只是 mock |

### 1.2 硬性條件（必須保留）

1. **`provider.ts`（ai-core v3.4.1 MultiProviderClient）整段沿用**。OpenCode primary → Gemini key-pool → OpenAI/Codex final fallback。
2. **Skills 載入機制保留**，且**升級為 Claude Code 標準**（純 `name` + `description` + 選用 `metadata` frontmatter）。
3. **AI key pool 三表 schema 不變**（`api_key_leases` / `api_key_cooldowns` / `api_key_usage`），ai-core ProjectBridgeAdapter 依賴。
4. **OpenAI OAuth (PKCE)** route 整段沿用。

### 1.3 什麼是新的（vs v1.5）

- 跨模式共用記憶池（Turn + ExtractedFact）
- Skill scope-aware + 主動讀（AI 看 description 自己決定讀哪個 body）
- Plugin bundle 機制（給 HPSkills 整包搬）
- MCP servers 一級公民
- 合議制 thinking（Persona-based council，可選）
- Per-mode model 偏好
- 統一 SSE chat endpoint（取代 v1.5 多種 chat route）
- Vue 3 SFC 輸出（取代 v1.5 純 HTML 拼裝）

### 1.4 砍掉的（vs v1.5）

- multi-agent 黑盒：`masterAgent` / `plannerAgent` / `subAgent` / `parallelGenerator` / `qualityScorer` 全部 drop（debug 痛苦）
- HTML 直接拼裝（改 Vue SFC）
- HTML patch 機制（改「重生整段 SFC」）

---

## 2. 資料模型

### 2.1 Project

頂層容器，一條「想做某個產品」的完整工作。

```typescript
Project {
  id: string                    // uuid v4
  name: string
  ownerId: string
  shareToken?: string           // 多人 share，沿用 v1.5
  councilConfig?: CouncilConfig // § 6 合議制
  createdAt: timestamp
  updatedAt: timestamp
}
```

### 2.2 Turn（跨模式記憶單位）⭐ 核心

每輪使用者送出 + AI 回應 = 一個 Turn。跨模式記憶的最小單位。

```typescript
Turn {
  id: string
  projectId: string
  mode: 'consult' | 'architect' | 'design'
  userText: string
  aiResponse: {
    text: string                // 給使用者看的正式回應
    thinking?: string           // 單聲 thinking（非合議時）
    discussion?: Voice[]        // 合議制的多 voice 對話
    artifactRef?: string        // 產出物的 id
  }
  skillsUsed: string[]          // 命中的 skill name
  modelUsed: string             // 'opencode/gemini-2.5-flash' 等
  tokens: { prompt, completion, total }
  createdAt: timestamp
}

Voice {
  round: number                 // 1, 2, 3...
  persona: string               // skill name
  text: string
}
```

### 2.3 ExtractedFact

AI 每輪結束時順便產 0–N 個結構化 fact。把記憶從「全文檢索」變「結構化」，省 token、可控、可查。

```typescript
ExtractedFact {
  id: string
  projectId: string
  turnId: string                // 哪一輪產的
  kind: 'requirement' | 'page' | 'constraint' | 'decision'
  text: string                  // 短句，例：「目標族群：30-50 歲女性」
  supersededBy?: string         // 被新 fact 取代時指過去（軟刪）
  createdAt: timestamp
}
```

### 2.4 Artifact

設計或架構模式產出的東西。

```typescript
Artifact {
  id: string
  projectId: string
  createdByTurnId: string
  kind: 'vue-sfc' | 'page-graph' | 'design-tokens'
  name: string                  // 'login.vue'、'pages.graph.json'
  payloadPath: string           // data/ 下相對路徑
  metadata?: Record<string, unknown>
  supersededBy?: string         // 重生時舊版指新版
  createdAt: timestamp
}
```

### 2.5 記憶池怎麼餵 AI（每次 chat）

AI 在任何模式回應前，被餵：

1. **目前有效的 ExtractedFact**（不含 superseded）— 全部含進 prompt（通常 < 2k token）
2. **最近 N 個 Turn**（時間排序，含 mode tag）— 含 userText + aiResponse.text；M1 N=20 或直到 token budget 用完
3. **更早的 Turn**（若有）— 摘要成「截至第 K 輪：…」一段 plain text（由 fact 派生，AI 不必看每句）
4. **Active artifact**（若設計模式正在編某頁）
5. **當前 mode 的 system prompt**

跨模式自然：顧問討論的「目標族群 30-50 女性」會出現在 design mode 的 prompt 內（透過 fact + recent turns）。

**Memory budget**：M1 預設總 prompt 不超過 model context window 的 70%，剩 30% 給 skill body + AI 回應。當 budget 不夠時優先順序：facts > recent turns > older summary > skill bodies > artifact 全文（artifact 太大就 summary）。

---

## 3. 模式視覺與互動

### 3.1 整體版面（四區）

```
┌─────────────────────────────────────────────────────────┐
│  ⌘ 專案名     [顧問] [架構] [設計]            ⚙ 設定   │  ← 頂部
├─────────┬───────────────────────────────────────────────┤
│ 共用    │                                                │
│ 記憶池  │      mode-specific view                       │
│ （時間  │      （依當前模式顯示 chat / graph / preview）│
│   軸）  │                                                │
│         │                                                │
├─────────┴───────────────────────────────────────────────┤
│  輸入框（placeholder 隨模式變）              [送出]    │  ← 底部
└─────────────────────────────────────────────────────────┘
```

### 3.2 顧問模式（consult）

純對話。AI 不產 artifact，只釐清需求、給建議、解答疑問。

- 主畫面 = chat 訊息流（user / AI / AI thinking 三種泡泡）
- AI 思考過程顯示為虛線框 bubble，跟回覆分開
- placeholder：「跟 AI 顧問釐清需求 / 規格 / 限制…」

### 3.3 架構模式（architect）

主畫面是頁面結構圖（節點 = 頁面、邊 = 跳轉關係），用 `@xyflow/react`。

- 可拖拉節點、加減節點、連線
- 選中節點 → 右側 inspector 顯示頁面名稱、簡述、設計指引
- AI 看記憶提案 page 結構；接 chat 指令調整圖
- 產出 Artifact kind = `page-graph`
- placeholder：「請 AI 加頁面、改跳轉、調分組…」

### 3.4 設計模式（design）

從架構模式拿到的頁面逐個生 Vue SFC，preview iframe 即時看。

- 頂部 page chips（一個 page 一個 chip，點切換 active）
- 主畫面：sandbox iframe 預覽當前 page 的 Vue SFC（Tailwind Play CDN）
- 右側 chat panel：對當前頁下指令，AI 重生 SFC，preview 更新
- M1 SFC 只 `<template>`，M2 才加 `<script setup>`（state / event）
- **改畫面 = 重生整段 SFC**（不做 HTML patch）
- 產出 Artifact kind = `vue-sfc`
- placeholder：「改畫面…」

### 3.5 模式間切換

任何時候可切，所有狀態保留。記憶池是共用的。

### 3.6 記憶池左欄

- 每個 Turn 用色帶顯示模式：藍（顧問）/ 橘（架構）/ 紫（設計）
- Turn 點開可看完整對話
- M2 功能：釘 Turn 到 prompt、從這裡分叉

### 3.7 chat 輸入框跨模式行為

| 模式 | 送出後 AI 做什麼 | 產 Artifact？ |
|---|---|---|
| 顧問 | 純對話 | ❌ |
| 架構 | 調整 page graph | ✅ page-graph |
| 設計 | 重生當前 page 的 Vue SFC | ✅ vue-sfc |

### 3.8 輸入管道（Ingestion）— 文件 / 圖片 / 剪貼簿

任何模式的輸入框都支援：

| 輸入類型 | 來源 | Server 處理 | AI 看到 |
|---|---|---|---|
| **純文字** | 鍵盤 | 直接附在 prompt | 文字 |
| **網址** | 文字裡含 URL | server 抓取網頁 → 純文字 + 主圖（M1 簡化版 fetch + readability） | 文字 + 圖（vision provider） |
| **PDF** | 上傳 button / 拖入 | `pdf-parse` 解析 → 純文字（保留段落） | 文字（每頁標 page N） |
| **DOCX** | 上傳 / 拖入 | `mammoth` 解析 → 純文字 | 文字 |
| **圖片**（PNG/JPG/WebP） | 上傳 / 拖入 / **剪貼簿貼上** | 縮放至 ≤ 2048px、轉 base64 | 多模態 vision input |
| **截圖**（剪貼簿） | `Ctrl+V` 在 input | 同圖片，加標記 `source: clipboard` | 多模態 |

**UI**：
- 輸入框底部一排小按鈕：📎（檔案）/ 📋（剪貼簿）/ 🔗（URL）；也接受拖拉直接進輸入框
- 已附加的檔案顯示為「附件卡」在輸入框上方，可移除
- 多個附件可同送（M1 上限 5 個 / 單檔 ≤ 20MB）

**儲存**：
- 上傳檔案存到 `data/projects/<project-id>/uploads/<uuid>.<ext>`，metadata 寫進 Turn 的 attachments 欄位
- AI 看到的是「解析後內容」，不重新解析；原檔保留作為佐證
- Turn 結構擴：
  ```typescript
  Turn {
    ...
    attachments?: Attachment[]
  }
  Attachment {
    id: string
    kind: 'pdf' | 'docx' | 'image' | 'url-snapshot'
    originalName: string          // 'spec.pdf'
    storedPath: string            // data/.../<uuid>.pdf
    parsedText?: string           // 給 AI 看的內容
    imageBase64?: string          // 給 vision provider
    mimeType: string
    sizeBytes: number
  }
  ```

**Vision 觸發條件**：當 attachment 有 image 且 model 支援 vision（Gemini、Claude、GPT-4o 等），自動切到 vision-capable model；不支援則 fallback 為「附了圖但 AI 看不到」+ 提示使用者描述。

**M1 範圍**：
- ✅ PDF（pdf-parse）、DOCX（mammoth）、Image（多模態）、剪貼簿貼上、URL fetch
- ✅ 拖拉、`Ctrl+V`、按鈕三種輸入方式
- ❌ OCR（影像內文字辨識）— 多模態 vision 已涵蓋多數場景，純 OCR M2 再說
- ❌ 影片、音訊
- ❌ Excel / PPT 解析（M2）

---

## 4. Skill + MCP 系統

### 4.1 Skill 格式（純 Claude Code 標準）

```yaml
---
name: housefun-price-domain
description: HousePrice 實價登錄 domain。當對話提到 實價、實登、Price、DealCase、買屋成交、地圖實登 時觸發。
metadata:
  type: domain-knowledge
  source: HPSkills
---

# 實價登錄 domain
...
```

**不擴自訂欄位**（沒有 `scope` / `priority` / `enabled_by_default`）。HPSkills 整包 zero-change 搬。

### 4.2 Skill 四層住處

1. **Built-in**（隨產品出貨）：`packages/server/skills/builtin/*.md`
2. **Plugin bundle**：`data/skills/plugins/<plugin>/skills/*.md` + `plugin.json`
3. **User-global**：`data/skills/global/*.md`，UI 內可編
4. **Project-local**：SQLite `project_skills` table（非檔案，為多人即時同步）

優先順序：Project > Global > Plugin > Built-in（同名上層勝）。

### 4.3 觸發機制（AI 主動讀）

```
1. Skill discovery   ─ 啟動掃 4 層，建 (name, description) index
2. System prompt 拼接 ─ AI 看到一份 description list（不含 body，省 token）
3. AI 主動            ─ AI 判斷需要哪個 → 呼叫 tool read_skill(name) 拿 body
4. 記錄使用           ─ 該 Turn 記錄 skills_used，左欄記憶池可看到
```

完全跟 Claude Code 同型，上百個 skill 也不爆 token。

### 4.4 Plugin bundle

每個 plugin = 一個資料夾，內含 `plugin.json`：

```json
{
  "name": "hpsk",
  "version": "1.0.0",
  "description": "HousePrice / 黑豹 internal domain skills",
  "skills": "./skills",
  "mcpServers": { "mssql-mcp": { ... } }
}
```

UI 有 Plugin Marketplace 分頁：本地安裝、啟停、看內容。

### 4.5 MCP servers

設定方式跟 Claude Code 一樣（`data/mcp-servers.json`）：

```json
{
  "mcpServers": {
    "mssql-mcp": { "command": "node", "args": [...], "env": {...} },
    "pencil": { "command": "pencil-mcp", "args": ["--stdio"] },
    "figma": { "url": "http://internal-figma-mcp:9000" }
  }
}
```

啟動時 connect 所有 server，tools / resources 註冊到 AI tool 池。

| 模式 | 適合的 MCP（範例） |
|---|---|
| 顧問 | mssql-mcp（佐證資料）、web-search |
| 架構 | mssql-mcp（決定頁面） |
| 設計 | pencil（讀 figma 稿）、figma |

### 4.6 Slash command

使用者打 `/skill-name` 強制 AI 讀那個 skill。例：`/hpsk:price-doc 我要做實價查詢頁`。

---

## 5. AI Provider Routing

### 5.1 沿用 v1.5 `provider.ts`

整段原封不動搬：
- `MultiProviderClient`（ai-core v3.4.1）
- `ExtendedOpenCodeAdapter`、`ExtendedOpenAIAdapter`、`CodexResponsesAdapter`
- RoutePolicy：`preferredProviders=[opencode]`、`fallbackProviders=[gemini, openai]`、`allowCrossProviderFallback=true`、`allowCrossModelFallback=true`
- OpenCode multi-server（`opencode_servers` JSON / `OPENCODE_SERVERS` env）
- Gemini key pool（`GeminiProviderAdapter` + `ProjectBridgeAdapter` 接 3 表）
- OpenAI OAuth (PKCE) routes
- `withJsonInstruction()` / `extractJsonBody()`（給 fact 萃取等 JSON 場景用）
- `invalidateProvider()`、`trackProviderUsage()`、`defaultModel()`

### 5.2 Drop 的東西

`masterAgent.ts` / `plannerAgent.ts` / `subAgent.ts` / `parallelGenerator.ts` / `qualityScorer.ts` / `specReviewAgent.ts` / `documentAnalysisAgent.ts` / `mcpConsultantEvidence.ts` 不要了。複雜協作改走 council pattern（§ 6）或 MCP subagent。

### 5.3 Thinking 雙路徑

- **Native**：routing 命中 Anthropic Claude → 用 native extended thinking block
- **Prompt fallback**：OpenCode / Gemini → system prompt 要求先吐 `<thinking>...</thinking>` 再寫正文
- Client 解析切兩段顯示

### 5.4 Per-mode model 設定

設定頁 UI：每個 mode 一個 dropdown，列所有 provider 支援的 model。

| 模式 | 建議 |
|---|---|
| 顧問 | Claude Opus / GPT-5（長 context + 強推理） |
| 架構 | Claude Sonnet / Gemini 2.5 Flash |
| 設計 | Gemini 2.5 Pro / GPT-5（Tailwind 熟悉） |

### 5.5 `callProvider` helper（收斂）

```typescript
async function callProvider(params: {
  mode: 'consult' | 'architect' | 'design';
  projectId: string;
  userMessage: string;
  memorySnapshot: MemorySnapshot;     // turns + facts（§ 2）
  activeArtifact?: ArtifactRef;
  streaming?: boolean;
}): AsyncIterable<Token> {
  // 1. 拼 system prompt（skill list + mode 指令 + thinking 指令）
  // 2. 選 model（per-mode preference）
  // 3. 呼叫 provider.streamContent / generateContent
  // 4. 串流回 Token（thinking 切段）
}
```

三個 mode 的 route handler 只負責驗 input + call callProvider + 萃 fact + 回前端。

### 5.6 SSE keepalive

所有 chat 走 SSE（`text/event-stream`）。每 15s 送 `: heartbeat\n\n` SSE comment，繞 nginx 60s timeout。

---

## 6. Team Thinking（合議制）

### 6.1 Persona 定義

Persona = 一個輕量 skill，frontmatter `metadata.type: persona`。

預設 4 角：

| Persona | 角色 | 關注 |
|---|---|---|
| persona-pm | 產品經理 | 目標族群、商業價值、scope |
| persona-designer | 設計師 | UX、視覺一致、無障礙、品牌 |
| persona-engineer | 工程師 | 可實作、效能、API、可維護 |
| persona-moderator | 主持人（系統角色） | 收斂、化解衝突、給最終回應 |

使用者可在 skill 編輯器加自訂 persona（例：persona-legal、persona-data-pm）。

### 6.2 Council 配置

```yaml
council:
  enabled: true
  members: [persona-pm, persona-designer, persona-engineer]
  moderator: persona-moderator
  max_rounds: 3
  trigger_modes: [architect, design]   # 顧問預設關
  trigger: on_demand                    # off / on_demand / important_only / always
```

| trigger | 啟動時機 | 成本 |
|---|---|---|
| `off` | 從不 | 低 |
| `on_demand` | 使用者按按鈕（**預設**） | 中 |
| `important_only` | 偵測「重大決策」自動啟 | 中 |
| `always` | 每次都開 | 高 |

### 6.3 三輪流程

```
Round 1 ─ 初步意見         並行（N 個 provider call 同時）
Round 2 ─ 互相回應         序列（每個 voice 看前面所有發言）
Round 3+ ─ 收斂             續討論到共識或上限
Final ─ Moderator 結論     單次，整理成給使用者的正式回應
```

3 persona × 3 round + 1 moderator = ~10 provider calls / Turn。Latency 10x、cost 10x。

### 6.4 UI 呈現

- 每個 persona 一個顏色（PM 藍 / Designer 粉 / Engineer 綠 / Moderator 金）
- 分輪 divider：「Round 1 · 初步意見」「Round 2 · 互相回應」
- 整段可收合（歷史 turn 預設折）
- Moderator 收斂特別樣式（金底 + ⚖️ 圖示 + 「給使用者的最終回應」分隔）

### 6.5 實作細節

| 面向 | 做法 |
|---|---|
| 每 round 並行/序列 | Round 1 並行；Round 2+ 序列 |
| 每 voice model | 沿用 § 5 per-mode |
| Streaming | 每 voice 完成立刻 SSE push |
| 取消 | 使用者按「夠了，直接結論」→ 跳到 moderator |
| 單 voice 失敗 | skip，moderator 用剩下意見收斂 |
| 全失敗 | fallback 回單聲 thinking |
| 記憶儲存 | 整個 council = 1 Turn，`aiResponse.discussion` 放 voice 陣列 |

### 6.6 Cost 警告

預設 `on_demand` 而不是 `always`。重大決策（架構、新頁面、品牌色）開合議；小調整不開。

---

## 7. 持久化

### 7.1 切割原則

- **SQLite**：需要查詢/關聯/統計的
- **檔案**：大段文字、要 diff、給人編、給工程師打包的
- **Socket.io**：跨人即時的

### 7.2 SQLite Schema（9 表）

```sql
-- 專案 ---------------------------------------------
CREATE TABLE projects (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  owner_id        TEXT NOT NULL,
  share_token     TEXT UNIQUE,
  council_config  TEXT,                  -- JSON
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Turn（跨模式記憶單位） ---------------------------
CREATE TABLE turns (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  mode           TEXT NOT NULL,           -- consult | architect | design
  user_text      TEXT NOT NULL,
  ai_response    TEXT NOT NULL,           -- JSON: {text, thinking, discussion[], artifactRef}
  skills_used    TEXT,                    -- JSON array
  model_used     TEXT,
  tokens         TEXT,                    -- JSON: {prompt, completion, total}
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_turns_project ON turns(project_id, created_at);
CREATE INDEX idx_turns_mode    ON turns(project_id, mode);

-- ExtractedFact ------------------------------------
CREATE TABLE extracted_facts (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  turn_id        TEXT NOT NULL REFERENCES turns(id)    ON DELETE CASCADE,
  kind           TEXT NOT NULL,           -- requirement|page|constraint|decision
  text           TEXT NOT NULL,
  superseded_by  TEXT REFERENCES extracted_facts(id),
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_facts_project ON extracted_facts(project_id, kind);

-- Artifact metadata（payload 在檔案） --------------
CREATE TABLE artifacts (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by_turn TEXT NOT NULL REFERENCES turns(id),
  kind            TEXT NOT NULL,          -- vue-sfc|page-graph|design-tokens
  name            TEXT NOT NULL,
  payload_path    TEXT NOT NULL,
  metadata        TEXT,
  superseded_by   TEXT REFERENCES artifacts(id),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_artifacts_project ON artifacts(project_id, kind, created_at);

-- 專案 skill（不放檔案是為多人即時同步） -----------
CREATE TABLE project_skills (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  content     TEXT NOT NULL,
  enabled     INTEGER DEFAULT 1,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, name)
);

-- 專案 settings（per-mode model、council 等） ------
CREATE TABLE project_settings (
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  PRIMARY KEY(project_id, key)
);

-- 全域 settings、users / sessions（沿用 v1.5）
CREATE TABLE settings    ( key TEXT PRIMARY KEY, value TEXT NOT NULL );
CREATE TABLE users       ( id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, password_hash TEXT, created_at TIMESTAMP );
CREATE TABLE sessions    ( token TEXT PRIMARY KEY, user_id TEXT, expires_at TIMESTAMP );

-- AI key pool（ai-core 必要，schema 不能改）-------
CREATE TABLE api_key_leases    ( ... 沿用 v1.5 );
CREATE TABLE api_key_cooldowns ( ... 沿用 v1.5 );
CREATE TABLE api_key_usage     ( ... 沿用 v1.5 );
```

### 7.3 檔案佈局

```
data/
├── bridge.db                     # SQLite WAL mode
├── skills/
│   ├── global/                   # user-global，UI 可編
│   │   └── housefun-brand.md
│   └── plugins/                  # plugin bundles
│       └── hpsk/
│           ├── plugin.json
│           └── skills/
│               ├── price-doc.md
│               └── ...
├── artifacts/                    # per-project
│   └── <project-id>/
│       ├── login.vue
│       ├── pages.graph.json
│       └── tokens.json
└── mcp-servers.json

packages/server/skills/builtin/   # 隨產品出貨（repo 內）
├── vue-tailwind-basics.md
├── persona-pm.md
├── persona-designer.md
├── persona-engineer.md
└── persona-moderator.md
```

### 7.4 為什麼 artifact 走檔案，project_skills 走 DB

- **artifact 走檔案**：diffable、iframe 直接 serve、給工程師打包 zip、未來 git versioning
- **project_skills 走 DB**：多人即時同步（A 編 B 立刻看到，不用 reload）

### 7.5 Socket.io 即時同步事件

| 事件 | payload |
|---|---|
| `turn:added` | 完整 Turn |
| `fact:added` / `fact:superseded` | fact / 被取代 id |
| `artifact:added` / `artifact:superseded` | metadata |
| `project_skill:changed` | name + new content |
| `council:stream` | 每個 voice 完成時即時推 |
| `cursor:move` | { userId, position }（presence） |

### 7.6 v1.5 → 新版

**不做自動遷移，fresh start**。理由：v1.5 schema 跟新版不對映、強行遷移會把舊架構缺陷帶來、有價值的資料手動 export 即可。`api_key_*` 三表 schema 不變所以 key pool 狀態保留（熱啟）。

### 7.7 備份

- 每天 cron tar `data/bridge.db` + `data/artifacts/` + `data/skills/` → `data/backups/<date>.tar.gz`
- 保留 30 天
- 不上 git，rsync 到 NAS（後期）

---

## 8. API 與錯誤處理

### 8.1 路由前綴與 auth

所有 API 走 `/api/*`。Auth：Bearer token（session token from cookie 或 Authorization header）。Share token：`?share=<token>` query param，給未登入訪客唯讀。

### 8.2 主要 API 群

| 群 | 路由（重點） |
|---|---|
| Auth | `POST /auth/login`、`POST /auth/logout`、`GET /auth/me`、`POST /openai-oauth/start` 等 |
| Projects | `GET /projects`、`POST /projects`、`GET /projects/:id`、`PATCH`、`DELETE`、`POST /share/rotate` |
| Turns | `GET /projects/:id/turns`、`SSE /projects/:id/chat`、`POST /chat/:turnId/cancel` |
| Facts | `GET/POST/PATCH/DELETE /projects/:id/facts[/:id]` |
| Artifacts | `GET /projects/:id/artifacts`、`GET /:artId/payload`、`GET /artifacts/zip`、`POST /:artId/regenerate` |
| Skills | `GET /skills`、`GET /skills/:name`、`POST/PUT/DELETE /projects/:id/skills[/:name]`、`/skills/global` |
| Plugins | `GET /plugins`、`POST /plugins/install`、`PATCH/DELETE /plugins/:name` |
| MCP | `GET /mcp`、`POST/PATCH/DELETE /mcp/:name`、`POST /mcp/:name/reconnect` |
| Settings | `GET/PATCH /settings`、`GET/PATCH /projects/:id/settings` |
| Health | `GET /health` |

### 8.3 SSE event 格式（chat 統一）

```
event: phase
data: {"phase": "loading_memory|selecting_skills|thinking|answering"}

event: thinking_token
data: {"text": "..."}

event: token
data: {"text": "..."}

event: done
data: {"turnId": "trn_abc", "tokens": {...}, "artifact": {...}}

: heartbeat                           # 每 15s

# 合議制變體
event: council_start
data: {"members": [...]}

event: council_voice
data: {"round": 1, "persona": "persona-pm", "text": "..."}

event: council_synthesis
data: {"text": "..."}
```

### 8.4 統一錯誤格式

```json
{
  "error": {
    "code": "PROVIDER_TIMEOUT",
    "message": "OpenCode 沒有回應，已切到 Gemini fallback",
    "detail": { ... },
    "requestId": "req_abc123"
  }
}
```

### 8.5 Error codes

| code | HTTP | 說明 |
|---|---|---|
| `AUTH_REQUIRED` | 401 | 沒登入 / token 過期 |
| `FORBIDDEN` | 403 | 非擁有者也非 share viewer |
| `NOT_FOUND` | 404 | 資源不存在 |
| `VALIDATION_FAILED` | 400 | input 缺欄位或型別錯 |
| `PROVIDER_TIMEOUT` | 504 | 所有 provider 都 timeout |
| `PROVIDER_RATE_LIMITED` | 429 | 所有 key cooldown 中 |
| `SKILL_NOT_FOUND` | 404 | read_skill 找不到 |
| `COUNCIL_CANCELLED` | 409 | 合議制被中途取消 |
| `INTERNAL_ERROR` | 500 | 其他未分類 |

---

## 9. 測試策略

### 9.1 Unit（vitest）

- `provider.ts` adapter routing（mock 各 provider，驗 RoutePolicy）
- memory snapshot 組裝（turns + facts 過濾排序）
- skill 解析（frontmatter parser、優先序、衝突）
- fact 萃取（deterministic 邏輯）
- council orchestrator（round 流程、cancel、單 voice 失敗 fallback）

### 9.2 Integration（vitest + sqlite memory）

- chat API end-to-end（mock provider，驗 SSE event 序列）
- Socket.io 廣播（建 Turn 後其他 client 收到 `turn:added`）
- Plugin 安裝後 skill 出現在 `GET /api/skills`

### 9.3 E2E（Playwright）

- 核心 happy path：登入 → 建專案 → 顧問問問題 → 切架構 → 切設計 → 看到 preview
- 多人協作：兩 client 同時開同專案，一邊送 chat、另一邊收到
- 合議制：on_demand 觸發 → 看 4 voice 出現 → 取消 → 跳到 moderator 收斂

### 9.4 不在 M1

效能測試、負載測試、a11y 全面審查、plugin 沙箱安全 → M2。

---

## 10. 開放問題（M1 之後處理）

- Plugin marketplace 遠端 registry（M2）
- AI subagent 跨工具長流程（看 Claude Code Agent SDK 模式）
- Vue SFC `<script setup>` 自動生（state/event/API stub，§ 5 提到的 M2）
- Per-project git 自動 commit（artifact 改動時）
- Plugin 沙箱：plugin 可不可以執行任意程式？目前 trust model 是「使用者自己決定要不要安裝」
- Mobile / 平板 UX（目前焦點是 desktop）
- AI 提示注入防護（使用者貼進來的內容若含 prompt injection 怎麼辦）

---

## 11. 下一步

1. 使用者 review 本 spec（這份檔案）
2. 進 `superpowers:writing-plans` skill 產實作計畫
3. **M1 = 完整可上線產品**（17 個 plan，含合議制、ingestion、RWD、備份、e2e baseline）
4. **M2 後**：Vue `<script setup>` codegen（state/event/API stub）、plugin remote marketplace、git auto-commit、AI prompt injection 防護、效能/load test 全面

詳見 [`../plans/2026-06-01-m1-plan-index.md`](../plans/2026-06-01-m1-plan-index.md)。

---

**Spec end。請使用者 review。**
