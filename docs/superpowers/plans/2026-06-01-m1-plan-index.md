# M1 Plan Index — DesignBridge 重做（M1 = 完整可上線產品）

**日期**：2026-06-01
**狀態**：Plan 1 已寫，Plan 2–17 待寫（每個 plan 跑完再寫下一個）
**Spec**：[`../specs/2026-06-01-designbridge-redesign-design.md`](../specs/2026-06-01-designbridge-redesign-design.md)

---

## 總目標（一句話）

> 按 [`m1-plan-index`](.) + [spec](../specs/2026-06-01-designbridge-redesign-design.md) 依序跑完 17 個 plan，做出 PM / 設計師用的 **3-mode 共用記憶池 AI 設計助理**：顧問 / 架構 / 設計三模式平行、跨模式記憶、Claude Code 標準 skill + MCP、合議制 thinking、可上傳文件 / 圖片 / 剪貼簿、輸出 Vue 3 + Tailwind SFC、多人即時協作、含 RWD + 備份 + e2e baseline。

## M1 終點檢驗（17 plan 全跑完 = 上線）

```
1. 使用者登入 → 建立 / 共享專案
2. 顧問模式：對話 + 拖檔 / 貼截圖 / 貼 URL，AI 思考過程可見
3. 切到架構模式：page graph 可拖拉，AI 提案頁面
4. 切到設計模式：逐頁生 Vue SFC，iframe 預覽即時，可下載 zip 給工程師
5. 切回顧問繼續討論 → AI 仍記得前面所有上下文
6. 開合議制：4 角色（PM / 設計 / 工程 / 主持人）討論 → moderator 給答案
7. 設定頁可加 / 編 / 刪 skill、裝 plugin、設每模式 model、看 token 用量
8. 兩人同時開同一專案 → 即時同步、看得到對方游標
9. 平板 / 手機開得起來
10. 每天備份 → 不掉資料
```

達成 = M1 上線。

## 17 個 Plan（依序）

| # | Plan | Goal（執行完看到什麼） | 依賴 | 文件 |
|---|---|---|---|---|
| 1 | **Foundation** | 可登入 + 建專案 + 看清單 | – | [plan-01-foundation.md](2026-06-01-plan-01-foundation.md) |
| 2 | Provider routing | server 呼叫 OpenCode/Gemini/OpenAI（含 fallback、key pool、OAuth） | 1 | _待寫_ |
| 3 | Memory model | Turn / Fact CRUD + memory snapshot API | 1 | _待寫_ |
| 4 | Skill system | 啟動掃 4 層 skills、`/api/skills` 列得出 hpsk 整包 | 1 | _待寫_ |
| 5 | MCP + Plugin loader | mssql-mcp / pencil 連得上、tools 列得到 | 1, 4 | _待寫_ |
| 6 | **Ingestion** | PDF / DOCX / 圖片 / URL / 剪貼簿上傳 + 解析 + 多模態送 AI | 1 | _待寫_ |
| 7 | Chat SSE endpoint | curl `/api/projects/:id/chat` 吐 token 流（含 thinking、附件） | 2, 3, 4, 5, 6 | _待寫_ |
| 8 | Client shell | 工作區四區佈局 + 模式切換骨架 + 拖拉/貼上 input | 1 | _待寫_ |
| 9 | Consult mode | 顧問模式可對話、看 thinking、記憶池有 Turn、附件顯示 | 7, 8 | _待寫_ |
| 10 | Architect mode | 拖拉 page graph、AI 提案頁面 | 9 | _待寫_ |
| 11 | Design mode | 點頁面 chip 看 Vue 預覽、chat 改畫面、下載 zip | 10 | _待寫_ |
| 12 | **Council 合議制** | 4 角色（PM/設計/工程/主持人）討論、3 輪、moderator 收斂、可取消 | 9 | _待寫_ |
| 13 | Socket.io sync | 兩 client 看同一專案、turn 即時推送、cursor presence | 9 | _待寫_ |
| 14 | Settings + Skills UI | 加 / 編 skill、安裝 plugin、設每模式 model、share token UI、看 token 用量 | 8 | _待寫_ |
| 15 | **Backup + maintenance** | nightly tar `data/`、30 天保留、健康監控、log rotation | 1 | _待寫_ |
| 16 | **RWD / mobile** | 平板（768-1280px）+ 手機（&lt; 768px）佈局可用 | 8, 9, 10, 11 | _待寫_ |
| 17 | **手動 smoke + a11y baseline** | smoke markdown checklist + WCAG AA 對比度 spot check（不寫 Playwright） | 全部 | _待寫_ |

## M2 後再做（明確不在 M1）

| 項目 | 為什麼不在 M1 |
|---|---|
| Vue `<script setup>` codegen（state/event/API stub） | spec § 3.4 明確 M2，需要更多 prompt 工程 |
| Plugin remote marketplace（hosted registry） | 需要額外 server infra |
| Per-project git 自動 commit artifact 改動 | nice-to-have，不影響使用 |
| AI prompt injection 深度防護 | 研究主題，需要先收 case |
| 效能 / load test 全面 | 上線後看實際流量再做 |
| AI subagent 跨工具長流程 orchestration | M1 用 council 已涵蓋多數場景 |
| OCR 純文字辨識 | 多模態 vision 已涵蓋 |
| Excel / PPT 解析 | M1 PDF/DOCX/圖片已涵蓋多數場景 |

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

1. **這份索引**（10 分鐘）— 知道有什麼 plan、依賴、現在在哪、M1 終點什麼樣
2. **[Spec](../specs/2026-06-01-designbridge-redesign-design.md)**（30 分鐘）— 知道整套架構、決策依據、ingestion / council 細節
3. **下一個要做的 Plan**（按執行順序）— 知道每一步怎麼做
4. （可選）**[5/26 已 revert 的 AI UI Compiler spec](../specs/2026-05-26-ai-ui-compiler-redesign.md)** — 知道**為什麼不走 AST 那條路**（避免重蹈覆轍）

---

**Index end. Plan 2 等 Plan 1 跑完再寫。**
