# M1 Plan Index — DesignBridge 重做

**日期**：2026-06-01
**狀態**：Plan 1 已寫，Plan 2–12 待寫（每個 plan 跑完再寫下一個）
**Spec**：[`../specs/2026-06-01-designbridge-redesign-design.md`](../specs/2026-06-01-designbridge-redesign-design.md)

---

## 總目標

把 v1.5 整個重做為 **3-mode AI 設計助理**（顧問 / 架構 / 設計），共用記憶池、Claude Code 標準 skill + MCP、可選合議制 thinking、輸出 Vue 3 + Tailwind SFC。Server + Client 全寫，只保留 v1.5 的 provider 路由 + skill 載入架構。

## M1 終點檢驗

```
1. 使用者登入 → 建立專案
2. 顧問模式 → 跟 AI 釐清需求（思考過程可見）
3. 切到架構模式 → 看 AI 提案頁面結構圖（page graph 可拖拉）
4. 切到設計模式 → 逐頁生 Vue SFC（iframe 預覽即時）
5. 切回顧問繼續討論 → AI 仍記得前面所有上下文
6. 設定頁可加 / 編 / 刪 skill、設定每模式 model
7. 兩人同時開同一專案 → 一邊送 chat、另一邊即時看到
```

達成 = M1 可上線。

## 12 個 Plan（依序）

| # | Plan | Goal（執行完看到什麼） | 依賴 | 文件 |
|---|---|---|---|---|
| 1 | **Foundation** | 可登入 + 建專案 + 看清單 | – | [plan-01-foundation.md](2026-06-01-plan-01-foundation.md) |
| 2 | Provider routing | server 能呼叫 OpenCode/Gemini/OpenAI（mock test 全綠） | 1 | _待寫_ |
| 3 | Memory model | Turn / Fact CRUD + memory snapshot API（無 AI，先驗資料流） | 1 | _待寫_ |
| 4 | Skill system | 啟動掃 4 層 skills、`/api/skills` 列得出 hpsk 整包 | 1 | _待寫_ |
| 5 | MCP + Plugin | mssql-mcp / pencil 連得上、tools 列得到 | 1, 4 | _待寫_ |
| 6 | Chat SSE endpoint | curl `/api/projects/:id/chat` 真的吐 token 流（含 thinking） | 2, 3, 4, 5 | _待寫_ |
| 7 | Client shell | 工作區四區佈局 + 模式切換骨架（無內容） | 1 | _待寫_ |
| 8 | Consult mode | 顧問模式可對話、看 thinking、記憶池有 Turn | 6, 7 | _待寫_ |
| 9 | Architect mode | 拖拉 page graph、AI 提案頁面 | 8 | _待寫_ |
| 10 | Design mode | 點頁面 chip 看 Vue 預覽、chat 改畫面立刻更新 | 9 | _待寫_ |
| 11 | Socket.io sync | 兩 client 看同一專案、turn 即時推送 | 8 | _待寫_ |
| 12 | Settings + Skills UI | 加 / 編 skill、設 per-mode model、看 token 用量 | 7 | _待寫_ |

## M2（M1 過後再說）

| Plan | 內容 |
|---|---|
| 13 | Council（合議制）— 完整 4 persona + 3 輪 + UI |
| 14 | Plugin marketplace UI — 安裝 / 啟停 / 看內容 |
| 15 | Vue `<script setup>` codegen — state / event / API stub |
| 16 | E2E + smoke test 完整套 + load test |
| 17+ | Git versioning artifact、a11y、效能、Mobile UX、prompt injection 防護 |

## Plan 寫作流程

每個 Plan：
1. 跑完上一個 Plan，確認 acceptance criteria
2. 進 `superpowers:writing-plans` skill 寫下一個
3. 寫完做 self-review（placeholder / 一致性 / scope / 模糊度）
4. commit 到 `docs/superpowers/plans/`
5. 選執行方式：subagent-driven 或 inline executing-plans
6. 跑完回 step 1

---

## 文件導覽（讀順序）

如果接手者完全沒看過：

1. **這份索引**（10 分鐘）— 知道有什麼 plan、依賴、現在在哪
2. **[Spec](../specs/2026-06-01-designbridge-redesign-design.md)**（30 分鐘）— 知道整套架構為何、決策依據
3. **下一個要做的 Plan**（按執行順序）— 知道每一步怎麼做
4. （可選）**[5/26 已 revert 的 AI UI Compiler spec](../specs/2026-05-26-ai-ui-compiler-redesign.md)** — 知道**為什麼不走 AST 那條路**（避免重蹈覆轍）

---

**Index end. Plan 2 等 Plan 1 跑完再寫。**
