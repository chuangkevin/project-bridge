## Why

借鏡 Claude Code 洩漏原始碼中的記憶架構設計，改進 Project Bridge 的 agent context 管理。

現有問題：
1. **Skills 全量注入** — 20 個 skills 全部塞進每個 agent prompt（~10K tokens 浪費），大部分不相關
2. **不從錯誤學習** — 上次生成「物件詳情頁空白」，下次同專案同頁面還是會犯一樣的錯
3. **Skills 被當真理** — agent 照抄 skill 規則不質疑，跟使用者需求矛盾時默默照做
4. **Sub-agent 返回垃圾不擋** — HTML 結構壞的、內容空的，要等 assembler 才發現

Claude Code 的三個設計原則值得學：
- **Skeptical Memory** — 記憶只是 hint，必須驗證後才行動
- **三層記憶** — 永遠載入的輕量索引 + 按需載入的詳細內容 + 歷史 grep
- **Strict Write Discipline** — 確認成功後才更新狀態

## What Changes

- **三層 context 架構** — plannerAgent 改成分層注入：L1 永遠載入（專案 meta）、L2 按需（相關 skills）、L3 歷史（上次 QA 結果）
- **跨 session lessons** — 每次生成後，把 QA 失敗 pattern 存到 DB，下次同專案生成時注入 agent prompt
- **Skeptical skill injection** — agent prompt 明確要求「質疑 skill 規則是否符合當前需求」
- **Pre-assembly validation** — sub-agent 返回 HTML 後立刻結構驗證，壞的直接 retry，不進 assembler

## Capabilities

### New Capabilities
- `layered-context`: plannerAgent 的 prompt 分三層注入 — L1 永遠載入（專案名/頁面/設計方向/使用者角色，<500 tokens）、L2 按需（跟當前 agent 職責相關的 top 3 skills，<1500 tokens）、L3 歷史（上次 QA report 摘要 + 使用者修正回饋，<500 tokens）
- `session-lessons`: 每次生成後，從 QA report 提取失敗 pattern 存到 `project_lessons` DB 表。下次生成時，這些 lessons 注入到 buildLocalPlan 和 sub-agent prompt，避免重複犯錯
- `pre-assembly-gate`: sub-agent 返回 HTML 後，立刻檢查結構有效性（有 page wrapper div、text content > 50 chars、div balance ±2 以內）。不通過的直接 retry，不等 assembler

### Modified Capabilities
（無現有 spec 需修改）

## Impact

- `packages/server/src/services/plannerAgent.ts` — context 分層注入邏輯
- `packages/server/src/services/parallelGenerator.ts` — pre-assembly gate + lessons 存取
- `packages/server/src/services/subAgent.ts` — lessons 注入 prompt
- `packages/server/src/services/masterAgent.ts` — lessons 注入 buildLocalPlan
- `packages/server/src/db/migrations/` — 新增 project_lessons 表
- `packages/server/src/routes/chat.ts` — 傳遞 lessons 到生成 pipeline
