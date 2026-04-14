## Context

`project-bridge` 的多步 Gemini 工作流目前呈現兩層混合：
- ai-core 負責 key pool、retry、Gemini client
- consumer repo 仍自己處理步驟切分、lease heartbeat、與部分 retry orchestration

現在 ai-core 已經提供：
- `StepRunner`
- `LeaseHeartbeat`
- `planPreferredKeys`

因此 `project-bridge` 可以開始把 generic orchestration 邏輯上收為共享實作，只保留自己的 domain step 與 prompt 內容。

## Goals / Non-Goals

**Goals**
- 讓 `geminiRetry.ts` 不再維護本地 `startLeaseHeartbeat`
- 讓 `documentAnalysisAgent.ts` 在技能步驟上改用 `StepRunner`
- 保持既有結果格式與產品行為不變

**Non-Goals**
- 不重寫全部 Gemini 呼叫點
- 不改動資料庫 schema
- 不把 project-bridge 的 domain prompt 或 skill 內容搬進 ai-core

## Decisions

### D1: 先做最小採用，不一次重寫所有呼叫點

第一批只接兩個最明顯的點：
- `geminiRetry.ts` 的 lease heartbeat
- `documentAnalysisAgent.ts` 的技能步驟串接

### D2: StepRunner 只包技能步驟，不動 document type extraction 主流程

`documentAnalysisAgent.ts` 裡最明顯的多步 Gemini 流程是 Step 4 的 skill 執行（explore / uxReview / designProposal / businessContext）。

這段最適合改成 `StepRunner`：
- 有命名步驟
- 可接受 shared fallback
- 需要 step-level metadata

前面的 classify / extractSpec / extractDesign 先維持現狀，避免一次重寫過大。

### D3: 保持 project-specific orchestration 在 consumer 層

仍由 `project-bridge` 決定：
- 哪些步驟要跑
- 技能內容與 prompt
- 是否在步驟間保留額外 delay 或觀測資訊

ai-core 只負責 generic runner / heartbeat。
