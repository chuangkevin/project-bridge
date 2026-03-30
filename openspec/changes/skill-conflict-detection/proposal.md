## Why

使用者輸入需求後，4-agent 討論（Echo/Lisa/David/Bob）和 sub-agent 生成都有注入 Skill 作為「專案知識庫」，但**沒有人負責比對 Skill 定義的業務規則與使用者需求是否矛盾**。例如：使用者說「不需要登入」，但 Skill 文件明確要求「所有操作需身份驗證」— 系統不會發現這個衝突，直接生成了不合規的原型。

此外，parallel 生成路徑的 sub-agent 完全沒收到 Skill context，導致生成的頁面內容不符合業務知識。

## What Changes

- 新增 Skill 衝突檢測 Agent — 在 planAndReview 討論結束後、生成開始前，用 AI 比對使用者需求 vs Skill 規則，產出衝突報告
- 衝突報告以 SSE 串流推送到前端，讓使用者看到「⚠️ 你的需求跟 XX 規則衝突」
- 如果有 critical 衝突，暫停生成並要求使用者確認（繼續 or 修改需求）
- Sub-agent 注入 Skill context — parallel 生成時每個 sub-agent 都收到相關業務知識
- David（QA Agent）prompt 強化 — 明確要求比對 Skill 規則找邏輯衝突

## Capabilities

### New Capabilities
- `skill-conflict-check`: 在規劃完成後、生成前，用 AI 比對 Skill 規則 vs 使用者需求，產出衝突報告（conflicts[]），串流到前端顯示，critical 衝突可暫停生成等使用者確認
- `sub-agent-skill-injection`: 將相關 Skill 內容注入 parallel 生成的 sub-agent prompt，讓頁面生成符合業務知識

### Modified Capabilities
（無現有 spec 需修改）

## Impact

- `packages/server/src/services/plannerAgent.ts` — David QA prompt 強化，新增衝突檢測步驟
- `packages/server/src/services/subAgent.ts` — 接收並注入 skills 參數
- `packages/server/src/services/parallelGenerator.ts` — 傳遞 skills 到 sub-agent
- `packages/server/src/routes/chat.ts` — 衝突報告 SSE 推送、暫停確認邏輯
- `packages/client/src/components/ChatPanel.tsx` — 顯示衝突報告 UI
