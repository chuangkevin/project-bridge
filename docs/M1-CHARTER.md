# DesignBridge M1 Charter

**日期**：2026-06-01
**這份文件**：M1 重做的**單一真相來源**。目標、功能、測試、Plan 列表、驗收標準一份搞定。
**輔助文件**（深入細節時看）：
- 設計細節：[`docs/superpowers/specs/2026-06-01-designbridge-redesign-design.md`](superpowers/specs/2026-06-01-designbridge-redesign-design.md)
- Plan 詳細實作步驟：[`docs/superpowers/plans/2026-06-01-plan-01-foundation.md`](superpowers/plans/2026-06-01-plan-01-foundation.md)（其餘 plan 跑完上一個再寫）
- 為何不走 AST/Compiler：[`docs/superpowers/specs/2026-05-26-ai-ui-compiler-redesign.md`](superpowers/specs/2026-05-26-ai-ui-compiler-redesign.md)（已 revert 的教訓）

---

## 0. 一句話目標

> 重做 DesignBridge：PM / 設計師用的 **3-mode AI 設計助理**（顧問 / 架構 / 設計），三模式共用記憶池、Claude Code 標準 skill + MCP、可上傳文件 / 圖片 / 剪貼簿、可選合議制 thinking、輸出 Vue 3 + Tailwind SFC、多人即時協作、含 RWD + 備份 + e2e baseline。**17 個 plan 跑完 = M1 上線。**

---

## 1. M1 在 30 秒

- **重做範圍**：v1.5 整包砍掉，server + client 全寫。**只保留** `provider.ts`（ai-core 多 provider 路由）+ skill 載入架構 + `api_key_*` 三表 schema。
- **核心新概念**：跨模式共用記憶池（Turn + ExtractedFact + Artifact），AI 在任何模式都看得到完整上下文。
- **AI 行為由 skill 主導**：純 Claude Code 標準（`name` + `description` + `metadata` frontmatter），4 層住處（built-in / plugin / global / project），AI 看 description 自己決定讀哪個 body。
- **思考過程使用者看得到**：thinking bubble 跟正式回應分開；可選開「合議制」讓 4 角色（PM / 設計 / 工程 / 主持人）討論再決定。
- **輸出**：Vue 3 + Tailwind SFC，可下載 zip 給工程師。

---

## 2. 完整功能清單（M1 全包）

### 2.1 認證與專案

| 功能 | 說明 |
|---|---|
| 首次安裝建立 admin | `/setup` 頁面，第一個帳號自動是擁有者 |
| 登入 / 登出 / Session | bcrypt 密碼、30 天 session token、cookie + Authorization header 雙支援 |
| 專案 CRUD | 建、看、改名、刪 |
| Share token | 給訪客唯讀的連結，可 rotate（讓舊 token 失效） |
| Multi-user 多人 | Socket.io 即時同步 + cursor presence |

### 2.2 三模式工作區

| 模式 | 主畫面 | 互動 | 產出 |
|---|---|---|---|
| **顧問** | chat 訊息流（user / AI / thinking） | 純對話、釐清需求 | 無 artifact |
| **架構** | page graph（`@xyflow/react`） | 拖拉節點、連線、AI 提案 | `page-graph` artifact |
| **設計** | Vue SFC preview iframe + page chips | chat 改畫面 = AI 重生整段 SFC | `vue-sfc` artifact（一頁一個） |

任何模式都可切，記憶池共用。模式間切換不掉資料。

### 2.3 跨模式共用記憶

| 元素 | 說明 |
|---|---|
| **Turn** | 一次 user + AI 互動的最小單位，標 mode tag |
| **ExtractedFact** | AI 每輪自動萃 0–N 個結構化事實：`requirement` / `page` / `constraint` / `decision`，可被新 fact superseded |
| **Artifact** | 產出物（`vue-sfc` / `page-graph` / `design-tokens`），metadata 在 DB、payload 在檔案 |
| **記憶池左欄** | 時間軸顯示所有 Turn，色帶分模式（藍/橘/紫）；點 Turn 可看完整對話 |
| **AI 怎麼吃記憶** | 每次 chat 餵：fact 全部 + 最近 N turn + 早期 turn 摘要 + active artifact + mode-specific system prompt（70% context budget） |

### 2.4 Ingestion（輸入管道）— 這次重點

| 輸入類型 | 來源 | 處理 | AI 看到 |
|---|---|---|---|
| 文字 | 鍵盤 | 直接附 prompt | 文字 |
| **URL** | 文字裡含 | server fetch + readability | 文字 + 主圖 |
| **PDF** | 上傳 / 拖入 | `pdf-parse` | 文字（標 page N） |
| **DOCX** | 上傳 / 拖入 | `mammoth` | 文字 |
| **圖片** | 上傳 / 拖入 / **剪貼簿貼上** | 縮 ≤ 2048px + base64 | 多模態 vision |
| **截圖** | `Ctrl+V` | 同圖片 | 多模態 vision |

**UI**：輸入框底部 📎 / 📋 / 🔗 三按鈕；接受拖拉；附件卡顯示在輸入框上方可移除。M1 上限：單檔 ≤ 20MB、同送 ≤ 5 個。

### 2.5 Skill + MCP + Plugin 系統

| 元素 | 說明 |
|---|---|
| **Skill 格式** | Claude Code 標準：`name` + `description` + `metadata` frontmatter + markdown body |
| **Skill 4 層住處** | built-in（repo）/ plugin bundle（`data/skills/plugins/<name>/`）/ user-global（`data/skills/global/`）/ project（SQLite `project_skills` 表） |
| **觸發機制** | AI 看 description list 自己選要讀哪個 → 呼叫 `read_skill(name)` tool；命中的 skill 記在 Turn metadata |
| **Plugin bundle** | 一個 `plugin.json` + 多個 skill；HPSkills 整包可 zero-change 搬 |
| **MCP servers** | `data/mcp-servers.json` 設定，mssql-mcp / pencil / figma 等可接 |
| **Slash command** | 使用者打 `/skill-name` 強制讀 |
| **衝突保護** | 優先序 project > global > plugin > built-in；同名上層勝出 |

### 2.6 合議制 Thinking（Council）

| 元素 | 說明 |
|---|---|
| **Persona** | 一個輕量 skill，`metadata.type: persona` |
| **預設 4 角** | PM / 設計師 / 工程師 / 主持人（moderator） |
| **使用者可自訂** | 在 skill 編輯器加 persona-legal / persona-data-pm 等 |
| **3 輪結構** | Round 1（並行初步意見）→ Round 2（序列互相回應）→ Round 3+（收斂）→ Moderator 結論 |
| **trigger** | `off` / `on_demand`（預設）/ `important_only` / `always` |
| **UI** | 每角色一色帶、分輪 divider、整段可收合、moderator 結論特別樣式 |
| **可取消** | 進行中可按「夠了，直接結論」跳到 moderator |
| **Cost 警告** | ~10 provider call / Turn，cost + latency 10x；預設 on_demand |

### 2.7 AI Provider 路由

| 沿用 v1.5 不動的 | 細節 |
|---|---|
| `provider.ts` 整段（ai-core v3.4.1） | MultiProviderClient + ExtendedOpenCodeAdapter + ExtendedOpenAIAdapter + CodexResponsesAdapter |
| RoutePolicy | OpenCode primary → Gemini key-pool → OpenAI/Codex final fallback |
| OpenCode multi-server | `opencode_servers` JSON / env |
| Gemini key pool | 3 表 schema 不變（ai-core ProjectBridgeAdapter 依賴） |
| OpenAI OAuth (PKCE) | routes 直接搬 |

| M1 新加 | 細節 |
|---|---|
| Per-mode model 偏好 | 設定頁可指定顧問用 X、設計用 Y |
| Thinking 雙路徑 | Claude native extended thinking / 非 Claude 用 prompt `<thinking>` 包 |
| `callProvider` helper | 收斂所有 AI 呼叫進單一進入點 |
| SSE keepalive 15s | 繞 nginx 60s timeout |
| Token usage 顯示 | 每個 Turn 顯示 provider / model / token |

| 砍掉的 v1.5 | 為什麼 |
|---|---|
| masterAgent / plannerAgent / subAgent / parallelGenerator / qualityScorer / specReviewAgent / documentAnalysisAgent / mcpConsultantEvidence | 黑盒 multi-agent，debug 痛苦；改 council 透明對話 |
| HTML 直接拼裝 | 改 Vue SFC |
| HTML patch 機制 | 改重生整段 SFC |

### 2.8 持久化

| 儲存 | 內容 |
|---|---|
| **SQLite**（`data/bridge.db`） | 9 個業務表（projects / turns / extracted_facts / artifacts / project_skills / project_settings / settings / users / sessions）+ 3 個 ai-core 必須表（api_key_*） |
| **檔案**（`data/`） | Skill plugin 資料夾、user-global skills、artifact payloads（Vue SFC / page-graph JSON / token JSON）、上傳檔案、MCP 設定 |
| **Backup** | nightly cron tar `bridge.db` + `artifacts/` + `skills/` + `uploads/` → `data/backups/<date>.tar.gz`，保留 30 天 |

### 2.9 設定頁

| 子頁 | 功能 |
|---|---|
| **AI Providers** | OpenCode servers 列表 + 加減、Gemini key 池、OpenAI OAuth 連線、per-mode model 預設 |
| **Skills** | List 4 層所有 skill、啟停、編輯（global / project 可改）、新增 |
| **Plugins** | List 已裝、啟停、本地路徑安裝、看 plugin 內 skill + MCP |
| **MCP Servers** | List 連線狀態 + tools / resources、加 / 改 / 重連 |
| **Project** | 改名、share token rotate、council config |
| **Usage** | Token 用量總覽 per provider / per project |

### 2.10 RWD / Mobile

| 視窗 | 行為 |
|---|---|
| ≥ 1280px（desktop） | 4 區全顯：模式 tab + 記憶池 + mode view + 輸入框 |
| 768–1280px（compact） | 記憶池可收 toggle，其餘照舊 |
| < 768px（mobile） | 底部 tab nav 切「記憶 / 對話 / 預覽 / 檢視」，單一面板全寬 |

### 2.11 統一 SSE / Socket.io

| 通道 | 用途 |
|---|---|
| **SSE** `/api/projects/:id/chat` | AI streaming token、phase event、thinking、council voice、heartbeat |
| **Socket.io** | 多人同步（turn / fact / artifact / project_skill / cursor 變動廣播） |

### 2.12 統一錯誤格式

```json
{
  "error": {
    "code": "PROVIDER_TIMEOUT",
    "message": "中文錯誤訊息",
    "detail": { },
    "requestId": "req_abc123"
  }
}
```

9 個 error code enum：`AUTH_REQUIRED` / `FORBIDDEN` / `NOT_FOUND` / `VALIDATION_FAILED` / `PROVIDER_TIMEOUT` / `PROVIDER_RATE_LIMITED` / `SKILL_NOT_FOUND` / `COUNCIL_CANCELLED` / `INTERNAL_ERROR`。

---

## 3. 17 個 Plan（依序、依賴清楚）

| # | Plan | Goal（執行完看到什麼） | 依賴 |
|---|---|---|---|
| 1 | **Foundation** | 可登入 + 建專案 + 看清單 | – |
| 2 | Provider routing | server 呼叫 OpenCode/Gemini/OpenAI（含 fallback、key pool、OAuth） | 1 |
| 3 | Memory model | Turn / Fact CRUD + memory snapshot API | 1 |
| 4 | Skill system | 啟動掃 4 層 skills、`/api/skills` 列得出 hpsk 整包 | 1 |
| 5 | MCP + Plugin loader | mssql-mcp / pencil 連得上、tools 列得到 | 1, 4 |
| 6 | **Ingestion** | PDF/DOCX/圖片/URL/剪貼簿上傳 + 解析 + 多模態送 AI | 1 |
| 7 | Chat SSE endpoint | curl chat 吐 token 流（含 thinking、附件） | 2, 3, 4, 5, 6 |
| 8 | Client shell | 工作區 4 區 + 模式切換骨架 + 拖拉/貼上 input | 1 |
| 9 | Consult mode | 顧問可對話、看 thinking、記憶池有 Turn、附件顯示 | 7, 8 |
| 10 | Architect mode | 拖拉 page graph、AI 提案頁面 | 9 |
| 11 | Design mode | 點 page chip 看 Vue 預覽、chat 改畫面、下載 zip | 10 |
| 12 | **Council** | 4 角色 / 3 輪 / moderator 收斂 / 可取消 | 9 |
| 13 | Socket.io sync | 兩 client 同步、turn 即時、cursor presence | 9 |
| 14 | Settings + Skills UI | 加/編 skill、裝 plugin、per-mode model、share UI、token 用量 | 8 |
| 15 | **Backup + maintenance** | nightly tar + 30 天保留 + log rotation | 1 |
| 16 | **RWD / mobile** | 平板（768–1280）+ 手機（< 768）佈局 | 8, 9, 10, 11 |
| 17 | **手動 smoke + a11y baseline** | smoke checklist 打勾 + WCAG AA 對比度 spot check | 全部 |

---

## 4. 測試策略

### 4.1 Unit 測試（vitest）

每個 plan 必含：

| 範圍 | 測什麼 |
|---|---|
| `provider.ts` | RoutePolicy 命中、fallback、key pool cooldown |
| Memory snapshot 組裝 | Turn 過濾、Fact 排序、token budget cutoff |
| Skill 解析 | frontmatter parser、4 層優先序、衝突保護 |
| Fact 萃取 | AI response → fact 結構（deterministic） |
| Council orchestrator | 3 輪流程、cancel、單 voice 失敗 fallback |
| Ingestion parsers | PDF → text、DOCX → text、image base64 + resize |

### 4.2 Integration 測試（vitest + sqlite in-memory）

| API | 驗 |
|---|---|
| Auth | setup → login → me → logout 完整 lifecycle |
| Projects CRUD | 建/讀/改/刪、share rotate、跨使用者 403 |
| Chat SSE | mock provider，驗 phase / thinking / token / done event 序列 |
| Council SSE | 4 個 council_voice + council_synthesis event 出現 |
| Ingestion | 上傳 PDF → 解析 → Turn attachments 帶到 |
| Socket.io 廣播 | A client 建 turn，B client 收到 `turn:added` |
| Plugin install | 指定路徑 → skill 出現在 `GET /api/skills` |

### 4.3 手動 smoke 測試（不寫 Playwright）

每個 plan acceptance 都用**人工逐項操作**驗。寫成 markdown checklist 放 `docs/smoke/<plan>.md`，每次跑完打勾。

| Scenario | 步驟 |
|---|---|
| **核心 happy path** | 登入 → 建專案 → 顧問釐清 → 切架構 → 切設計 → 看到 preview → 下載 zip |
| **跨模式記憶** | 顧問講「目標族群 30-50 女性」→ 切設計 → AI 生 SFC 內容反映此族群 |
| **多人協作** | 兩 browser 開同一專案 → 一邊送 chat → 另一邊即時看到 turn |
| **合議制** | trigger on_demand → 看 4 voice 出現 → 取消 → 跳 moderator → 結論進 chat |
| **Ingestion** | 拖入 PDF → 解析後當 attachment → AI 看得到內容 |
| **Clipboard 截圖** | `Ctrl+V` 貼上截圖 → 顯示 attachment 卡 → AI 收到 multimodal input |
| **Plugin 安裝** | 設定頁 → 安裝本地 hpsk plugin → skill list 出現 hpsk:price-doc |
| **RWD** | 視窗縮到 700px → 底部 tab nav 切換面板 |

不寫 Playwright 自動化的 trade-off：
- 省工時，沒有 e2e 維護成本
- 重構時要靠手動 regression（charter 與 plan 內列出的 smoke checklist 是唯一保護）
- 上線後若回歸頻繁，再回頭補 Playwright（M2+）

### 4.4 a11y baseline

| 檢項 | 標準 |
|---|---|
| 對比度 | WCAG AA 4.5:1（內文）、3:1（標題） |
| Input 標籤 | 所有 input 有 `aria-label` 或 `<label>` |
| 鍵盤導覽 | Tab 順序合理，Enter / Esc 預期作用 |
| Focus indicator | 看得見的 focus ring |
| Color-only meaning | 不單靠顏色傳訊息 |

---

## 5. 驗收標準（M1 上線檢驗）

**17 plan 跑完，下面 10 條全綠 = 上線：**

```
1. 使用者登入 → 建立 / 共享專案 ✓
2. 顧問模式：對話 + 拖檔 / 貼截圖 / 貼 URL ✓
   AI 思考過程可見（thinking bubble） ✓
3. 切到架構模式：page graph 可拖拉，AI 提案頁面 ✓
4. 切到設計模式：逐頁生 Vue SFC，iframe 預覽即時 ✓
   可下載 zip 給工程師 ✓
5. 切回顧問繼續討論 → AI 仍記得前面所有上下文 ✓
6. 開合議制：4 角色討論 → moderator 給答案 ✓
   可中途取消 ✓
7. 設定頁可加 / 編 / 刪 skill、裝 plugin、設每模式 model、看 token 用量 ✓
8. 兩人同時開同一專案 → 即時同步、看得到對方游標 ✓
9. 平板 / 手機開得起來且可操作 ✓
10. 每天備份 → 確認 30 天 retention ✓
```

---

## 6. M1 不包含（M2 後再做）

| 項目 | 為什麼不在 M1 |
|---|---|
| Vue `<script setup>` codegen（state/event/API stub） | spec § 3.4 明確 M2；M1 只 `<template>` |
| Plugin remote marketplace（hosted registry） | 需要額外 server infra |
| Per-project git 自動 commit artifact 改動 | nice-to-have，M1 已用檔案存便於 diff |
| AI prompt injection 深度防護 | 研究主題，需先收實際 case |
| 效能 / load test 全面 | 上線後看實際流量再做 |
| AI subagent 跨工具長流程 orchestration | M1 用 council 已涵蓋 |
| OCR 純文字辨識 | 多模態 vision 已涵蓋 |
| Excel / PPT 解析 | M1 PDF/DOCX/圖片已涵蓋多數場景 |

---

## 7. 寫作 / 執行流程

### 7.1 Plan 怎麼產出

```
1. 跑完上一個 Plan，確認 acceptance criteria
2. 進 superpowers:writing-plans skill 寫下一個
3. self-review（placeholder / 一致性 / scope / 模糊度）
4. commit 到 docs/superpowers/plans/<N>-<name>.md
5. 選執行方式：subagent-driven 或 inline executing-plans
6. 跑完回 step 1
```

### 7.2 Plan 怎麼執行

兩種：

**A. Subagent-Driven**（推薦）— 每 Task 派 fresh subagent 實作，兩階段 review（spec compliance + code quality）後進下個 Task。Coordinator 整理結果。

**B. Inline executing-plans** — 在同個 session 內逐 Task 跑，每幾個 Task 一個 checkpoint。

### 7.3 一句話交接

> 按 [`docs/M1-CHARTER.md`](docs/M1-CHARTER.md) 依序跑完 17 個 plan，達成第 5 節的 10 條驗收標準 = M1 上線。

---

## 8. 文件導覽

| 看什麼 | 開哪份 |
|---|---|
| 整體掌握（10 分鐘） | 本檔 M1-CHARTER.md |
| 設計細節 / 為何這樣決定 | [spec](superpowers/specs/2026-06-01-designbridge-redesign-design.md) |
| 當前要做的 plan（逐 Task） | [`plans/2026-06-01-plan-01-foundation.md`](superpowers/plans/2026-06-01-plan-01-foundation.md)（Plan 2–17 跑完上一個再寫） |
| 為什麼不走 AST/Compiler | [`specs/2026-05-26-ai-ui-compiler-redesign.md`](superpowers/specs/2026-05-26-ai-ui-compiler-redesign.md)（已 revert 的教訓） |

---

**Charter end. 跑完 17 plan + 通過 10 條驗收標準 = M1 上線。**
