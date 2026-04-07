## Why

現在的多頁面生成 pipeline 極度不穩定：master agent 429 → 整個 parallel pipeline crash → fallback 到 single-call → 只生成單頁內容 → 其他頁面是 placeholder。

根本原因：一次生成要消耗 5+ 個 API call（analysis + page structure + master agent + N sub-agents + summary + quality score），40 把 free-tier key（20 req/min/key）被快速耗盡。

## What Changes

- **砍掉 analysis call** — 用 keyword detection + AI classifyIntent 取代，省 1 call
- **砍掉 page structure call** — 用 keyword-based page templates 取代，省 1 call
- **砍掉 master agent AI call** — 用 buildLocalPlan() 取代（已有完整 sharedCss + page specs），省 1 call
- **Sub-agents 真正並行** — 5 頁面用 5 把不同 key 同時打，不共享 key
- **砍掉 summary call** — 用 local template 取代（已實作），省 1 call
- **延遲 quality scoring** — 改成背景任務（已是 setImmediate），不影響回應時間
- **Streaming 進度** — 每個 sub-agent 完成時即時通知 client（per-page progress）
- **結果：5 個 API call（5 sub-agents 並行）→ 全部完成 < 30 秒**

## Capabilities

### New Capabilities
- `zero-overhead-parallel`: 不依賴任何 AI 前置 call，直接用 local plan 驅動 sub-agents
- `per-page-streaming`: 每個頁面完成時立即串流到 client，不等全部完成
- `smart-key-dispatch`: 每個 sub-agent 分配不同 key，自動 retry 換 key

### Modified Capabilities
- `parallel-generation`: 移除 master agent dependency，改用 buildLocalPlan

## Impact

- `packages/server/src/routes/chat.ts` — 砍掉 analysis call、page structure call、confirm dialog；直接進 parallel path
- `packages/server/src/services/parallelGenerator.ts` — 強制用 buildLocalPlan，不呼叫 master agent
- `packages/server/src/services/masterAgent.ts` — planGeneration 保留但不再是 parallel 的 critical path
- `packages/server/src/services/geminiKeys.ts` — 改進 key dispatch（batch assign 不重複）
- `packages/client/src/components/ChatPanel.tsx` — per-page streaming progress UI
