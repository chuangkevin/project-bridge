## Why

4-agent 討論（Echo/Lisa/David/Bob）用 Gemini Flash 免費額度，推理能力有限。常見問題：
1. Agent 回答很表面，沒有深入分析（「這是一個購物網站」— 廢話）
2. 沒有對話歷史 — 第二輪對話時 agent 不知道之前聊了什麼
3. 一輪就結束 — 沒有人回頭確認最終方案是否完整
4. sub-agent 生成的頁面品質不穩定，沒有從過去的錯誤學習

不換 model（繼續用 Flash 免費），透過 prompt engineering + 多輪對話 + 自我驗證來提升推理品質。

## What Changes

- **結構化 prompt** — 每個 agent 的 prompt 從「開放式聊天」改為「先列事實 → 再推理 → 結論」的 chain-of-thought 框架，附 few-shot examples
- **對話歷史注入** — 把最近 5 輪對話歷史注入每個 agent 的 prompt，讓第二輪以後的對話有上下文
- **Echo 確認輪** — 4 agent 討論完後，Echo (PM) 再做一輪最終確認：檢查漏洞、整合意見、確定最終方案
- **Plan 自我驗證** — 產出 JSON plan 後，用一次 Flash call 自檢（漏頁面？導航死角？缺功能？）
- **強化場景模板** — 擴充 buildLocalPlan 的 7 種模板，每種加完整的必備元件清單 + 頁面間導航規則

## Capabilities

### New Capabilities
- `structured-agent-prompts`: 每個 agent（Echo/Lisa/David/Bob）改用結構化 prompt，包含 chain-of-thought 框架、few-shot examples、對話歷史注入
- `plan-self-verify`: JSON plan 產出後，額外一次 AI call 做自我驗證（檢查遺漏、導航、必備功能），修正 plan 後再生成
- `echo-confirmation-round`: 4 agent 討論完後 Echo 做最終確認輪，整合所有意見

### Modified Capabilities

（無現有 spec 需修改）

## Impact

- `packages/server/src/services/plannerAgent.ts` — 重寫 4 個 agent prompt + 加確認輪 + 對話歷史
- `packages/server/src/services/masterAgent.ts` — 強化 buildLocalPlan 場景模板
- `packages/server/src/routes/chat.ts` — 傳遞對話歷史到 planAndReview
- API call 數量：4 → 6（+1 Echo 確認 +1 plan 自檢），仍在 Flash 免費額度內
