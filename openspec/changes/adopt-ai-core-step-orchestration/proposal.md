## Why

`project-bridge` 現在已經使用 `@kevinsisi/ai-core` 提供的 `KeyPool` 與 `withRetry`，但 quota-sensitive multi-step 工作流仍留在 consumer repo 自己實作。

目前仍存在兩類重複邏輯：
- `geminiRetry.ts` 自己維護 lease heartbeat
- `documentAnalysisAgent.ts` 以多個 `withRetry` 與手動等待來協調多步 Gemini 任務

`ai-core` 現在已新增 `step-orchestration` primitives，因此 `project-bridge` 應開始改用共享實作，減少本地重複 orchestration 邏輯。

## What Changes

- 更新 `@kevinsisi/ai-core` 依賴到包含 `step-orchestration` 的版本/commit
- 將 `geminiRetry.ts` 的 lease heartbeat 改用 ai-core 的 `LeaseHeartbeat`
- 將 `documentAnalysisAgent.ts` 的技能步驟執行改為使用 ai-core 的 `StepRunner`
- 保留 project-specific prompt、技能內容、與資料庫 schema，不搬入 ai-core

## Impact

- `packages/server/package.json`
- `packages/server/src/services/geminiRetry.ts`
- `packages/server/src/services/documentAnalysisAgent.ts`
- `openspec` docs for this change
