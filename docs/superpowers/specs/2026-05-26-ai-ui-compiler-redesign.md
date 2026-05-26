# DesignBridge → AI UI Compiler 系統重新定義

**日期**：2026-05-26
**範圍**：產品定位 + 資料模型 + AI Pipeline + UI + 整合周邊 — 全棧重新定義
**狀態**：Brainstorm 完成、等使用者最終 review
**前置決議**：本 spec 取代 `2026-05-25-ui-refactor-design.md` — UI 重構在 brainstorm 過程中升級為產品重新定義

---

## 0. 摘要

DesignBridge 從「對話式 UI 生成器」重新定義為 **AI UI Compiler Platform**：
將非結構化輸入（PDF / 文件 / 截圖 / clipboard / URL / chat text）透過雙 IR pipeline 轉成受規則約束的 UI、設計規範與 Vue 程式碼。

**核心 thesis**：

> AI 只提案（generate / mutate proposals），AST 才是 truth；skill / design rule 在 AST build-time 以 deterministic transform 套用；codegen 是純機械翻譯。

**系統不是**：純聊天 assistant / 純 design inspiration board / 純 low-code editor / 純 prototyping toy。

**系統是**：UI + Spec + Code 的 deterministic transformation 系統。

---

## 1. 系統鳥瞰

```
┌──────────────────────────────────────────────────────────────┐
│  INPUT                                                        │
│  PDF · 文件 · 截圖 · clipboard · URL · chat text             │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  Ingestion Parser (deterministic)                            │
│  per-type parser → Ingestion AST (typed)                     │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
                    [Ingestion AST]
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  AI Semantic Builder                                         │
│  Ingestion AST → Semantic UI AST                             │
│  · Cold start: full AST output                               │
│  · Edit: tool-call mutation                                  │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
                  [Semantic UI AST]   ← single source of truth
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  Skill Engine (build-time transform pass)                    │
│  Apply JSON rules → mutate / validate AST                    │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  Design Constraints (build-time transform pass)              │
│  Apply design rules → annotate AST with styles / layout      │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
                  [Constrained AST]
                           │
                ┌──────────┴──────────┐
                ▼                     ▼
┌──────────────────────┐   ┌──────────────────────┐
│  Mock Backend (P1)   │   │  Production Backend  │
│  Vue 3 + Tailwind    │   │  + Composition API   │
│  visual only         │   │  + state / events    │
│  no logic / no API   │   │  + API binding stub  │
└──────────────────────┘   └──────────────────────┘
                                       │
                                       ▼
                              [Plugin slot]
                              （React / mobile / 等
                               未來可加）
```

---

## 2. Layer 1：產品定位

### 2.1 一句話

> AI 驅動的 UI 編譯器，將非結構化需求轉換為受規則約束的 UI、設計規範與前端程式碼。

### 2.2 核心使用者

| 角色 | 主要動作 | 系統價值 |
|---|---|---|
| **PM**（主要） | 用文件 / PDF / 截圖定義產品 | 不寫程式即可產 UI |
| **設計師** | 提供設計規範與參考、管理 design rules | 規則 first-class、不只是裝飾 |
| **工程師** | 接 API、輸出 Vue code、控制資料綁定與結構 | 拿到可接手的真正程式碼，不只是 mock |

### 2.3 核心目標

- 非技術輸入可直接變 UI
- UI 可被規則（skill / design system）約束
- UI 可直接轉 code
- spec 可被 AI 持續對話修正
- 同一系統串起 design → spec → implementation

### 2.4 系統邊界（明確排除）

- ❌ 純聊天 assistant（ChatGPT 類）
- ❌ 純 design inspiration board（Pinterest 類）
- ❌ 純 low-code editor（Bubble / Webflow 類）
- ❌ 純 prototyping toy（高保真但不可接手）
- ❌ 純 collaboration tool（Notion / Figma 多人功能本身）

### 2.5 設計原則

1. **所有輸入都要變 schema** — 不允許「純文字停留」
2. **Skill 永遠優先於 AI guess** — AI 不自由發揮 UI
3. **Design 是 constraint，不是裝飾** — UI 是被規則限制的結果
4. **Code 是 final artifact，不是 export bonus** — Vue code 是系統一部分，不是附加功能

---

## 3. Layer 2：AST 模型 + Dual Codegen Backend

### 3.1 Codegen Target（鎖死）

**Vue 3 + 自訂 components + Tailwind CSS**

選擇理由：
- AST 才是核心，UI library 只是 backend target
- 不該被 library 污染 AST design
- Tailwind 是 design rule 引擎的最乾淨落點（spacing / layout grammar / token control）
- 第一版 demo 不依賴 UI library、可換 renderer、AST 可重用

**這是 compiler reference backend，不是產品依賴**。

### 3.2 UI AST schema

**Two-stage AST**（routing C）：
- 高階：**Semantic UI AST**（framework-agnostic）— 主戰場
- 低階：**Vue SFC AST**（codegen target）— 透過 deterministic codegen 從高階產出

**ComponentNode shape**（高階 AST，鎖死）：

```typescript
ComponentNode {
  type: 'Input' | 'Table' | 'Form' | 'Modal' | 'Card' | ...   // 預設 base set ~20 種
  props: Record<string, any>
  layout: LayoutIntent                        // 排版 / spacing / hierarchy
  // Phase 1 (Mock backend 消費)
  style: StyleIntent                          // 視覺
  // Phase 2 (Production backend 才消費，但 schema 必須一次設計完整)
  bindings: DataBinding[]                     // API / state mapping
  events: EventBinding[]                      // 行為
  constraints: Rule[]                         // 規則約束 reference
  children: ComponentNode[]
}
```

**AST 必須一次設計完整 typed schema，不能分裂**。Mock backend 只消費 type / props / layout / style；Production backend 消費完整 schema。但 schema 不分版本。

### 3.3 Codegen 流程

```
Constrained AST → Renderer Layer → Vue 3 Components → Tailwind classes
```

### 3.4 Dual Backend 策略

| Phase | Backend | 輸出特性 |
|---|---|---|
| **Phase 1（MVP）** | **Mock Backend** | Vue 3 + Tailwind 能 render，純 visual fidelity；無 state、無 event、無 API、無 logic |
| **Phase 2** | **Production Backend** | + Composition API + state + event handlers + API binding stub |
| **Phase 3+** | **Plugin slot** | 未來可加 React / mobile / native target |

**第一個產品 milestone**（6–8 週 demo-able）：
- ✅ input → UI render 可視化
- ✅ layout 正確
- ✅ design rule 初步生效
- ✅ AST 可 debug / inspect
- ❌ 不做：state correctness / API integration / production readiness

### 3.5 本質定位

**AST 是產品本體，不是 codegen 的副產品**。AI 提案、AST 是 truth、codegen 是輸出。

---

## 4. Layer 3：AI Pipeline

### 4.1 AI ↔ AST 協議（Hybrid）

- **Cold start**：input → AI 吐**整份 Semantic UI AST**（JSON Mode）
- **Iterative edit**：AI 透過 tool calling 局部 mutate
  - `addComponent({ parent, type, props })`
  - `setProp({ nodeId, key, value })`
  - `removeComponent({ nodeId })`
  - `addBinding({ nodeId, path, source })`
  - `addConstraint({ nodeId, rule })`
- 兩套 prompt / 兩個 mode 並存

### 4.2 Dual IR Pipeline

```
Input
  → Ingestion Parser (deterministic, per input type)
  → Ingestion AST (typed)
  → AI Semantic Builder
  → Semantic UI AST
  → Skill Engine (rules transform pass)
  → Design Constraints (transform pass)
  → Codegen
```

**Ingestion AST schema**（per input type）：

```typescript
type IngestionAST =
  | { type: 'pdf'; pages: PdfPage[] }
  | { type: 'screenshot'; ocr_text: string; regions: Region[]; visual_structure: ... }
  | { type: 'clipboard'; format: 'html' | 'image' | 'text'; payload: ... }
  | { type: 'webpage'; dom: string; screenshot: string }
  | { type: 'requirement'; paragraphs: string[] }       // chat text 走這條
```

每種 input 有專屬 parser，輸出 typed IR。AI 只看 Ingestion AST，不直接看 raw input。

### 4.3 AI 在 Pipeline 的角色（明確分工）

| Layer | Responsibility | 由誰負責 |
|---|---|---|
| Ingestion AST | deterministic parsing | parser code |
| Semantic UI AST | semantic interpretation | **AI**（唯一 AI 動作點） |
| UI AST 本身 | truth | data |
| Skill Engine | constraint enforcement | rule code |
| Codegen | output translation | template code |

**AI 不是 input parser，AI 是 AST semantic compiler**。

### 4.4 Skill System（Dual Representation）

```
skill/houseprice/
  member.skill.md      ← 人類讀（PM / 設計師 / 工程師）
  member.rules.json    ← 機器讀（constraint engine 消費）
  buy.skill.md
  buy.rules.json
```

**Markdown layer**：說明規則、給人類讀、documentation + intent。

**JSON rules layer**：runtime constraint、AST transform input、deterministic execution。

**對應關係**：`rule.id`（JSON）↔ `section_id`（Markdown frontmatter / heading anchor）。CI 校驗一致性。

**Skill 已不再進 AI prompt**（只進 reference / debug）— **AI 不決定 rule，只遵守 rule**。

### 4.5 Rule 套用時機（鎖死）

**AST build-time（中間層）**，不在 parsing 前、不在 codegen 前：

```
AI 提案 AST
  ↓
Skill Engine (apply JSON rules) → mutate / validate AST
  ↓
Design Constraints (apply design rules) → annotate AST
  ↓
Codegen
```

理由：
- parsing 前 → AI 自己亂解讀規則、不可控
- codegen 前 → 已生 UI 才發現錯、補洞而非控制

### 4.6 Pipeline Phase 對 Mock / Production 的關係

```
Phase 1 (Mock pipeline):
  Input → Parsing → Ingestion AST → AI → UI AST → Mock renderer

Phase 2 (Production pipeline):
  Input → Parsing → Ingestion AST → AI → UI AST
       → Skill Engine → Design Constraints → Codegen
```

Phase 1 可暫不接 Skill Engine / Design Constraints（rule 套用是 no-op pass），先驗證 ingestion + AI + render 鏈條跑得通。

---

## 5. Layer 4：UI / Interaction Model

### 5.1 介面本質

> UI 是 **compiler debugger**，不是 workspace app。

- preview 是 **stage-dependent runtime visualization**，不是 UI result panel
- artifact 是 **source graph**，不是 project tab

### 5.2 整體 Layout（4-column）

```
┌────────────────────────────────────────────────────────────┐
│ Topbar：Project · [Ingestion·AST·Constraint·Codegen] · ⚙   │
├────┬───────┬─────────────────────────┬─────────────────────┤
│ AR │ CHAT  │       PREVIEW           │     INSPECTOR        │
│ TI │       │  (stage-dependent       │   (stage-dependent)  │
│ FA │ 訊息  │   runtime view)         │                      │
│ CT │ 歷史  │                         │  AST stage:          │
│    │       │  Ingestion stage:       │   AST tree (debug)   │
│ LI │ 輸入  │   raw input viz         │  Constraint:         │
│ ST │ 框    │  AST stage:             │   active rules       │
│    │       │   rendered UI           │   (read-only list)   │
│    │ 多入  │  Constraint stage:      │  Codegen:            │
│    │ 口    │   rules vs UI overlay   │   Vue code           │
│    │ (Q13) │  Codegen stage:         │   (on-demand drawer) │
│    │       │   code preview          │                      │
└────┴───────┴─────────────────────────┴─────────────────────┘
```

| 區域 | 內容 | 行為 |
|---|---|---|
| **Artifact rail**（左窄欄） | project 內所有 AST artifacts（source files 觀） | list；點選驅動其他三欄 |
| **Chat**（左欄） | hybrid thread system | global thread（project-level）+ per-artifact thread（每個 artifact 自己一條） |
| **Preview**（中欄、anchor） | 隨 stage 變化的 runtime view | 不是「永遠看 rendered UI」，是「看 pipeline 在這個 stage 的中間結果」 |
| **Inspector**（右欄） | stage-dependent 工具 | AST tree / 規則 list / Vue code drawer |

### 5.3 Workspace 組織原則

**Compiler stage 是組織單位**（不是 role 也不是 artifact）：

- `Ingestion`：看每個 input 抽出的 Ingestion AST 結構
- `Semantic AST`：看 AI 產出 / mutation 後的 Semantic UI AST，preview = rendered UI
- `Constraint`：看 rule 套用前後的 diff，preview overlay active rules
- `Codegen`：看 Vue code、export 動作入口

### 5.4 AST 在 UI 的可見度

**Debug-only**（PM / 設計師預設不見）：
- AST tree 顯示為 JSON-like tree（右欄）
- 工程師開 debug mode 才看
- AI mutation 在 AST tree 上 highlight diff
- **沒有獨立 Spec view** — AST 本身就是 spec

**Vue code**：on-demand drawer（從底部 / 右側滑入），不常駐。

### 5.5 編輯 / Mutation Affordance

兩種使用者觸發 AST mutation 的途徑：
1. **Chat**：自然語言指示 → AI 用 tool call mutate AST
2. **點 Preview 元件**：開 contextual edit panel → user 直接調 props / binding

AI 變更後回饋：chat 文字解釋 + AST tree 上 diff highlight（**preview 不額外 highlight**）。

### 5.6 Project / Artifact 模型

- 一個 Project = 一個 workspace，含：
  - 多個 AST artifacts（element / page / N-pages 都是 AST node tree；可跨 artifact reference）
  - Skill ruleset（loaded JSON rules）
  - Design ruleset（extracted / curated）
  - Ingestion inputs（PDF / images / URL crawl snapshots）
  - Chat threads（global + per-artifact）
- artifact 數量不限、kind 不限（取代「固定 5 個 page」舊模型）

### 5.7 Mock / Production 切換

**Auto by milestone**（Q12: B）— 切換是 project metadata，不是 per-call switch。

### 5.8 Input 進系統

**多入口**（Q13: B）：
- 拖 / 貼到 chat
- 上傳 button
- URL bar / crawl 入口
- Wizard（新專案時可選）

### 5.9 冷凍 4 輪 UI 結論審判

| 舊決議（2026-05-25 spec 中） | 結果 |
|---|---|
| Layout B（3-column） | ✅ 部分倖存 — 升級為 4-column（加 artifact rail） |
| Tools 全保留（DesignPanel + StyleTweaker） | ❌ 死 — 被 stage-dependent inspector 取代；DesignPanel 表單模型不存在 |
| Architecture as Preview view tab | ❌ 死 — 整個被「stage tab」取代 |
| Artifact Selector 下拉 | ⚠️ 變形 — 變成左側 artifact rail（list + detail） |

---

## 6. Layer 5：整合 / 基礎建設

### 6.1 Persistence（Hybrid）

```
project-folder/
  project.sqlite              ← metadata, sessions, chat threads
  artifacts/
    home.ast.json            ← Semantic UI AST
    list-page.ast.json
    search-bar.ast.json
  skills/
    houseprice/
      member.skill.md
      member.rules.json
  design-rules/
    primary-theme.rules.json
  inputs/
    spec-v1.pdf
    crawl-2026-05-26.snapshot.json
```

- SQLite 存 metadata、session、chat threads（轉碼率高的資料）
- File-system 存 AST / skill / rules / inputs（git-friendly，可 diff、可 PR review）

### 6.2 Skill / Design Rule 編寫工具

**Mixed**（Q2: D）：
- 系統內可瀏覽 skill / rules（read-only），不能直接編
- 編寫透過 AI 輔助：使用者用自然語言描述 rule → AI 翻成 JSON → 校驗 → 寫入 file
- 手寫 JSON 仍允許（給工程師 / power user）
- CI 校驗（git hook + GitHub Action）

### 6.3 Design Intelligence Pipeline

**One-shot extraction**（Q3: A）：
- URL crawl → AI 一次性萃取 design rules → 寫成 JSON snapshot
- **不保持 live linkage**（避免外部 site 變動造成系統漂移）
- 想更新就重 crawl、生新 snapshot、人類審後合併

### 6.4 Component Registry

**Extensible**（Q4: B）：
- 內建一組 base components（~20 個：Form / Input / Table / Card / Modal / Button / ...）
- 外部專案可加自訂 component plugin
- Per-project 可 override mapping（同一 ComponentNode.type 可用不同實作）

### 6.5 Multi-codegen Backend

**Mock + Production + Plugin slot**（Q5: B）：
- Mock backend（P1 必交付）
- Production backend（P2 交付）
- Plugin slot 預留（未來 React / mobile / native 不必動主架構）

### 6.6 Collaboration

**保留 real-time multi-user**（Q6: B）：
- Socket.io 留下
- 多人同編同一 project / artifact
- 跟系統邊界（不做純 collab tool）不矛盾 — collab 是支援功能而非產品本質

### 6.7 Auth

**Simple auth**（Q7: B）：email + password。不做 SSO（暫不接公司 IdP）。

### 6.8 Provider / AI Model

**保留現有 `MultiProviderClient`**（Q8: A）：
- OpenCode primary → Gemini key-pool fallback → OpenAI / Codex configured fallback
- ai-core v3.4.1 介面不動
- 設定路徑（OpenAI OAuth flow / Gemini key 管理 / OpenCode servers）保留

但 AI 在新系統的**呼叫點變了**：
- 舊：chat / generation / sub-agent / planner 多處呼叫
- 新：兩個明確呼叫點 — (1) Ingestion AST → Semantic UI AST、(2) Semantic UI AST mutation via tool call

### 6.9 Export

**全部支援**（Q9: D）：
- Vue project zip（download）
- Public preview URL（read-only share link）
- Embeddable iframe

### 6.10 Versioning

**Git integration**（Q10: C）：
- Project = git repo（local clone or hosted）
- AST / skill / rules 都是 commit-able artifacts
- 每次 AI mutation 可以變成一個 commit（或合併成 batch commit）
- diff / branch / merge 跟一般 git 一樣
- 取代「snapshot in DB」傳統模式

### 6.11 Debug / Observability

**內建 debug panel**（Q11: B）：
- 顯示 current pipeline stage
- Token usage（per stage、per provider）
- Active rules（哪些 skill / design rule 被套用）
- AI tool call log

不接外部 telemetry（可後續再加）。

### 6.12 CI / Validation

**Git hook + CI pipeline**（Q12: C）：
- `verify-rules`：JSON rules schema 校驗、rule conflict 偵測、dead rule 偵測
- `verify-ast`：AST schema 校驗、AST 必須 pass 所有 active rules
- `verify-skill-pair`：每個 skill 必須有 `.skill.md` ↔ `.rules.json` 對應、id mapping 一致
- pre-commit hook 自動跑、GitHub Action enforce 在 PR 上

### 6.13 跟現有 codebase 的關係

**C：保留 ai-core / provider / 部分 server，重做 client + AST 模型**（Q13: C）。

保留：
- `@kevinsisi/ai-core` 整個依賴鏈
- `MultiProviderClient` + adapters
- `ProjectBridgeAdapter` (storage adapter)
- OpenAI OAuth flow + helpers
- Provider helper 函式（`defaultModel()` / `withJsonInstruction()` / `extractJsonBody()` / `trackProviderUsage()` / `invalidateProvider()`）
- 既有的 `routes/settings.ts` 對 Gemini SDK 直呼（驗證使用者新增的 key）
- Socket.io collaboration 基礎建設
- SQLite storage 基礎建設

重做：
- 整個 `packages/client/`（chat / preview / inspector / artifact rail）
- AST 資料模型（取代現有 `messages[] + html string` 模型）
- AI 呼叫點（取代現有 `chat.ts` / `subAgent.ts` / `parallelGenerator.ts` / `plannerAgent.ts` 的多處呼叫）
- Ingestion Parser（取代現有 `documentAnalysisAgent.ts` 等分散邏輯）
- Skill 系統（從 markdown context → JSON rules constraint）
- Codegen layer（新增，目前無對應）

刪除：
- 「mode」概念（顧問 / 設計 / 架構）
- 「固定 5 page」假設（system prompt + planner + parallel generator）
- `DesignPanel` / `StyleTweakerPanel` 表單模型
- `ArchitectureTab` 的節點圖（被 stage tab 取代）

---

## 7. 與舊系統的清晰對照

| 維度 | 舊 DesignBridge | 新 AI UI Compiler |
|---|---|---|
| 輸出單位 | HTML preview 字串 | Vue code via Semantic UI AST |
| 中間表示 | HTML 字串 | Dual IR：Ingestion AST + Semantic UI AST |
| Skill 角色 | AI prompt context（markdown） | Runtime constraint engine（JSON rules） |
| Rule 套用 | prompt-level（AI 自己讀） | AST build-time transform pass |
| URL crawl | 一次性抓 + apply 到當前生成 | 萃取 reusable design rules，存 snapshot |
| Mode 概念 | 顧問 / 設計 / 架構（互斥 tab） | 不存在；改 compiler stage |
| 對話定位 | mode-bound（顧問 = 純對話、設計 = 產 UI） | compile pipeline 的 interactive debugger |
| Artifact 數量 | 固定 5 pages（system prompt 寫死） | 不限、kind 不限（element / page / N-pages） |
| Preview | 永遠 render UI | Stage-dependent runtime visualization |
| 介面組織原則 | Mode | Compiler stage |
| 介面數量 | 3-column | 4-column（加 artifact rail） |
| Spec view | 無 | AST 本身即 spec、不獨立 view |
| Code view | 無 | On-demand drawer |
| AST 可見度 | n/a | Debug-only tree |
| Versioning | SQLite latest only | Git-based commit graph |
| Persistence | 純 SQLite | Hybrid：SQLite metadata + file artifacts |
| Authoring | n/a | AI-assisted（自然語言 → JSON） |

---

## 8. 系統邊界 / 非目標

明確不做：
- AI 在 runtime 自由發揮 UI（rule 永遠優先）
- 純 chat-driven UI（compiler debugger 為主軸）
- Figma-like manual design tool（無拖拉視覺編輯器）
- 單一 backend 綁定（永遠維持 multi-backend / plugin 架構）
- Pure prototyping toy（Production backend 是 first-class 目標）

---

## 9. 未在本 spec 解決（後續再決）

- **Vue 版本細節**：Vue 3 已鎖，但 Composition API only / Options API 並存 / 兩者都支援 — TBD
- **Custom component library 細節**：哪 20 個 base components 入庫、API design — TBD（Layer 5 component registry 提到 extensible 但具體 base set 未定）
- **Rule schema 細節**：when / then / priority / conflict resolution 的 JSON shape — TBD
- **Plugin API**：第三方 codegen backend / 第三方 component 的 API contract — 等需求出現再定
- **CRDT / multi-user 編輯衝突**：Socket.io 保留但 OT/CRDT 細節 — TBD
- **AI tool call 列表完整定義**：本 spec 列出 5 個範例（addComponent / setProp / ...），完整集合 TBD
- **Vue codegen template 細節**：Mock backend / Production backend 的 codegen template — TBD
- **AST → spec doc 自動產生**：Q9 鎖「AST 即 spec、無獨立 view」，但若工程師要看人類可讀版，是否需要 auto-gen markdown — 未決

這些不影響 Layer 1-5 鎖定的架構，但實作時需要逐項決議。

---

## 10. 下一步

本 spec 是 **系統願景 + 架構鎖定文件**，**不是 implementation plan**。

**Scope warning**：這份 spec 涵蓋整個系統重新定義，scope 過大，不能單一 implementation plan 跑完。需要分階段：

| Plan | 範圍 | 預估規模 |
|---|---|---|
| **Plan 1** | Semantic UI AST schema 完整定義 + JSON Schema / TypeScript type + base component registry 第一版 | 中 |
| **Plan 2** | Ingestion AST + 各 input type parser（先做 chat text + 一種文件，譬如 PDF） | 中大 |
| **Plan 3** | AI Semantic Builder（cold start + tool call mutation）— 第一版 prompts / tool definitions | 大 |
| **Plan 4** | Skill Engine：JSON rules schema、constraint transform pass、第一條 reference rule（譬如 form submit button required） | 中 |
| **Plan 5** | Mock backend codegen：Vue 3 + Tailwind renderer，能跑出 visual fidelity | 中大 |
| **Plan 6** | 新 client UI：4-column stage-based workspace 第一版（chat / preview / inspector） | 大 |
| **Plan 7** | Project structure migration：hybrid persistence、git versioning、existing project 匯入 | 中 |
| **Plan 8** | Skill authoring AI flow + verify-rules CLI + git hook | 中 |
| **Plan 9** | Production backend codegen（Phase 2 起點） | 大 |
| **Plan 10** | Design intelligence pipeline、URL crawl → rule extraction | 中 |
| **Plan 11+** | Plugin slot、collaboration 升級、export、telemetry、misc | TBD |

**建議起點**：Plan 1（AST schema），因為所有其他 plan 的 type / interface / behaviour 都要 reference 它。AST 沒定，下游全是 placeholder。

進入 `writing-plans` skill 前，使用者需先核可本 spec 整體架構。如果想調整任何 layer 的 lock，現在是改的最後機會。

---

**Spec end**。請使用者 review。
