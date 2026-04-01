## Context

借鏡 Claude Code 的記憶架構（三層記憶 + Skeptical Memory + Strict Write Discipline），改進 Project Bridge 的 agent context 管理和品質控制。

現有架構：
- `plannerAgent.ts` — 4 agent 各收到全量 `skillsContext`（所有 skills 拼接）
- `parallelGenerator.ts` — sub-agent 已有 `selectRelevantSkills`（top 3），但 QA 只在 assembler 做
- `htmlQaValidator.ts` — 事後 QA，報告但不修正
- 沒有跨 session 記憶機制

## Goals / Non-Goals

**Goals:**
- Agent prompt token 用量減少 40%+（不注入無關 skills）
- 同專案第二次生成時，避免重複上次的錯誤
- Sub-agent 返回壞 HTML 時，在進入 assembler 前就攔截 retry
- Skills 被質疑而不是盲從

**Non-Goals:**
- 不做 autoDream 等背景整合（太複雜）
- 不做 KAIROS 主動觀察（超出範圍）
- 不改前端 UI

## Decisions

### 1. 三層 Context 架構

**Layer 1 — Always Loaded（<500 tokens）**
每個 agent 都收到：
```
【專案背景】
專案：{projectName}
設計方向：{designConvention 前 200 chars}
已有原型：{是/否，頁面列表}
本次需求：{userMessage}
```

**Layer 2 — Role-specific Skills（<1500 tokens）**
按 agent 角色篩選 skills：
- Echo（PM）→ 業務流程類 skills
- Lisa（UX）→ 設計美學類 skills（frontend-design-guide）
- David（QA）→ 業務規則類 skills（用於規則比對）
- Bob（Tech）→ 技術架構類 skills（feature-dev-guide）

篩選邏輯：每個 skill 有 name + description，用關鍵字匹配 agent 角色。每個 agent 最多 3 個 skills，每個截斷到 400 chars。

**Layer 3 — Historical Context（<500 tokens）**
注入上次同專案的 QA 結果：
```
【上次生成教訓】
- 「物件詳情」頁內容不足被標為空白，需要更詳細的 spec
- 外部圖片 URL 被移除，用 CSS placeholder
```

**理由：** 比全量注入（10K tokens）省 80%，但給每個 agent 最相關的 context。

### 2. Session Lessons 機制

**存：** 每次生成完成後，`parallelGenerator` 從 QA report 提取 lessons：
```typescript
// 從 QA report 提取 lessons
const lessons = qaReport.issues
  .filter(i => i.severity === 'critical')
  .map(i => `${i.page}: ${i.message}`);
```

**DB 表：**
```sql
CREATE TABLE project_lessons (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  lesson TEXT NOT NULL,
  source TEXT NOT NULL,  -- 'qa-report' | 'user-feedback' | 'retry-pattern'
  created_at TEXT DEFAULT (datetime('now'))
);
```

**讀：** 下次生成時，從 DB 讀最近 10 條 lessons，注入到 Layer 3。

**清理：** 超過 30 天的 lessons 自動刪除。

### 3. Pre-assembly Gate

**現在：** sub-agent 返回 → fragments 收集 → assembler 組裝 → QA 事後檢查 → fallback

**改成：** sub-agent 返回 → **立刻驗證** → 通過才加入 fragments / 不通過直接 retry

驗證項目：
1. 有 `<div class="page"` wrapper
2. text content > 50 chars
3. div open/close 差距 ≤ 2
4. 不含完整 HTML document（`<!DOCTYPE`）

**理由：** 在最早的環節攔截壞 HTML，retry 機會更大（API quota 還沒用完）。

### 4. Skeptical Skill Injection

在每個 agent prompt 的 skills 區塊加一行提醒：
```
⚠️ 以上知識庫內容僅供參考。如果 skill 規則與使用者的需求矛盾，
以使用者需求為準，並在【分析】中說明為什麼選擇忽略某條規則。
```

**理由：** 一行 prompt 就能改變 agent 行為，不需要額外 API call。

## Risks / Trade-offs

- **Lessons 可能過時** — 30 天清理 + 限制 10 條應該夠
- **Role-based skill 篩選可能不準** — 用 name + description 關鍵字匹配，fallback 回全量前 3
- **Pre-assembly gate 增加延遲** — 但比 assembler 發現空頁面再 retry 快，因為 retry 越早、API quota 越充足
