## Context

目前生成流程：`chat.ts` → `planAndReview()`（4-agent 討論）→ `generateParallel()`（sub-agent 並行生成）→ `assemblePrototype()`。

Skills 目前只在 planAndReview 的 agent prompt 和 chat.ts 的 effectiveSystemPrompt 中以文字注入，沒有結構化的比對邏輯。Sub-agent（parallel 路徑）完全沒有收到 skills。

## Goals / Non-Goals

**Goals:**
- 在規劃結束、生成開始前，自動檢測使用者需求與 Skill 業務規則的衝突
- 衝突結果串流顯示給使用者，critical 衝突可暫停等確認
- Sub-agent 生成時注入相關 Skill 內容
- David (QA Agent) 明確比對 Skill 規則

**Non-Goals:**
- 不做 Skill 編輯器或管理 UI（已有）
- 不做 Skill 自動修正（只報告衝突，由使用者決定）
- 不阻擋生成（即使有衝突，使用者確認後仍可繼續）

## Decisions

### 1. 衝突檢測放在 planAndReview 之後、generateParallel 之前

**選擇：** 獨立的 `checkSkillConflicts()` 函數，在 plan 完成後呼叫。

**理由：** plan 結果包含確定的頁面列表和 constraints，這時才有足夠資訊做比對。放在 planAndReview 裡面會讓 agent 流程更複雜。

**替代方案：** 讓 David QA Agent 負責 → 但 David 的 output 是自由文字，不容易結構化提取衝突清單。

### 2. 衝突檢測用 Gemini JSON mode

**選擇：** 一次 AI call，input = 使用者需求 + plan 結果 + 所有 active skills，output = JSON `{ conflicts: [{ rule, userIntent, severity, suggestion }] }`

**理由：** JSON mode 確保結構化輸出，方便前端顯示和程式判斷是否有 critical 衝突。

### 3. Sub-agent Skill 注入方式

**選擇：** 在 `generatePageFragment()` 加 `skills` 參數，注入到 system prompt 的 `BUSINESS RULES` section。每個 sub-agent 只收到跟它那頁相關的 skills（由 plan 的 page spec 決定）。

**理由：** 全量注入太長（token 浪費），按頁面相關性篩選更精準。

**替代方案：** 全量注入所有 skills → 簡單但 token 成本高，且 context window 可能溢出。

### 4. 前端衝突顯示

**選擇：** 在 ChatPanel 的 thinking 區域用特殊 SSE event type `conflict-report` 推送，前端渲染成黃色/紅色警告卡片。Critical 衝突顯示「繼續生成」/「修改需求」按鈕。

**理由：** 不需要新的 UI 組件，復用現有 SSE + ChatPanel 架構。

## Risks / Trade-offs

- **額外 API call 增加延遲** → 衝突檢測用 flash model + maxTokens 2048，控制在 2-3 秒。如果 skills 為空則跳過。
- **誤報** → AI 可能過度解讀衝突。用 `severity: 'info' | 'warning' | 'critical'` 分級，只有 critical 才暫停。
- **Token 成本** → sub-agent 多注入 skills 會增加 prompt tokens。限制每個 sub-agent 最多 3 個相關 skills，每個截斷到 300 chars。
