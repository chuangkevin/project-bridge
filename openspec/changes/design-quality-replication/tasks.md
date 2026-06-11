# Tasks: design-quality-replication

每個 Phase 結束：`pnpm --filter server build`、server vitest、相關 route/單元測試全綠後 commit（繁中 commit message 不限）；全部 Phase 完成後一次 push（雙 remote）。

## 1. Phase 1 — 地基：生成 context + fallback 顯性化

- [x] 1.1 `chatOrchestrator.buildSystemPrompt`：新增 active artifact source 區段（讀取 artifact payload；>60KB 走結構摘要 + 警告），單元測試含兩種路徑
- [x] 1.2 結構摘要產生器（v-if 頁面清單、nav 標籤、元件名）— 可先以 sfcSurgeon 雛形或 regex-free parser 實作
- [x] 1.3 `callProvider`：以 AsyncLocalStorage correlation 捕捉實際 selection（`generateWithSelection` 非流式 / `onSelect` hook 流式），回傳 `{provider, model, fallback}`
- [x] 1.4 `routes/chat.ts`：selection 寫入 `turns.model_used`、發 SSE `meta` 事件
- [x] 1.5 新設定 `disallow_model_fallback`（settings 讀寫 + route policy 動態建構 + `invalidateProvider`），單元測試驗證 policy 建構
- [x] 1.6 Client `TurnBubble` provider/model badge（fallback 橘色警示樣式）；`ProvidersTab` 開關 UI
- [x] 1.7 修正 `provider.ts:338` 錯誤註解與過時 vision 註解（provider.ts / designExtractor.ts）
- [x] 1.8 Phase 1 測試全綠 + commit

## 2. Phase 2 — sfcSurgeon + 雙軌編輯

- [x] 2.1 server 新增 htmlparser2 + dom-serializer 依賴；`services/sfcSurgeon.ts`：parse SFC、結構路徑定位、extract、replace、re-serialize
- [x] 2.2 Round-trip 單元測試：v-if/v-for/@click/slot/HTML 註解/中文內容/自閉合標籤，extract→replace 位元等價
- [x] 2.3 相關 style 抽取（class token 比對，寧多勿漏）+ 測試
- [x] 2.4 預覽 iframe 元素選取 → 結構路徑演算法（client 端與 server 同邏輯）+ 傳遞至 chat request
- [x] 2.5 元素軌道 endpoint/flow：子樹 + style + tokens 進 prompt → AI 回子樹 → 驗證（單根、可 parse）→ 原位替換 → 新 artifact version
- [x] 2.6 驗證失敗自動降級整頁軌道 + SSE 降級通知 + 測試
- [x] 2.7 整頁軌道：未選元素時完整 SFC + 嚴格保留指令（接 1.1 的 source 區段）
- [x] 2.8 Phase 2 測試全綠 + commit

## 3. Phase 3 — 元件庫

- [x] 3.1 Migration：`components` table（scope/project_id/name/description/template/style/tags/source/version/timestamps，含版本歷史保留策略）
- [x] 3.2 `services/componentLibrary.ts`：CRUD + 同名衝突（覆蓋 version+1 / 改名）+ 版本查詢
- [x] 3.3 routes：`/api/components`（list/get/create/update/delete）+ route 測試
- [x] 3.4 「存為元件」：預覽選取元素 → dialog（名稱/描述/scope）→ sfcSurgeon 抽取入庫；整個 artifact 存為元件
- [x] 3.5 生成 prompt 注入元件索引 + 佔位符指示（design/replicate 模式）
- [x] 3.6 `expandLibComponents()`：artifact 解析後佔位符原樣展開（template 替換 + style 合併去重 + class 前綴化）；未知名稱 → SSE error + 警告容器；單元測試含逐字元相等驗證
- [x] 3.7 Client 元件庫頁（瀏覽/搜尋/預覽/刪除/版本）
- [x] 3.8 Phase 3 測試全綠 + commit

## 4. Phase 4 — 照抄 pipeline

- [x] 4.1 `callProvider` 新增 `replicate` 模式（不注入 frontend-design、像素忠實指令、支援 `params.images`）
- [x] 4.2 Composer intake 偵測（圖片附件 / URL regex）→ 選項列 UI（意圖 × 目的地）→ `replicationIntent` 隨 request 送出
- [x] 4.3 未選擇時 server 注入「先確認意圖」指令（雙保險）
- [x] 4.4 圖片照抄 flow：圖片經 OpenCode multimodal 附上；失敗自動 geminiVisionQuery 規格路徑 + SSE 告知
- [x] 4.5 URL 照抄 flow：重用爬蟲 cleaned HTML（截 30K）+ computed style 摘要進 replicate prompt
- [x] 4.6 「插入選定區域」目的地：照抄結果經元素軌道錨點插入
- [x] 4.7 Route/單元測試（intake 分支、模式 prompt 組成、備援切換）
- [x] 4.8 Phase 4 測試全綠 + commit

## 5. Phase 5 — Domain skill selector

- [x] 5.1 `services/skillSelector.ts`：skill 索引 + 使用者訊息 → JSON 選擇呼叫（maxOutputTokens 512、`withJsonInstruction`/`extractJsonBody`），失敗回空清單
- [x] 5.2 注入邏輯：0–3 skills、8K/skill、20K 總上限；斜槓強制時跳過；寫入 `turns.skills_used`
- [x] 5.3 design/consult 流程接線 + UI phase 顯示「挑選知識中」+ skill badge
- [x] 5.4 單元/route 測試（選中、空、失敗、強制跳過）
- [x] 5.5 Phase 5 測試全綠 + commit

## 6. Phase 6 — iOS 27 液態玻璃 restyle

- [x] 6.1 重寫 `theme.css`：`--glass-*` 材質層 + 語意表面層 + 舊 token 映射 + `@supports` 降級 + `--spring` 曲線
- [x] 6.2 `.glass-panel`/`.glass-capsule`/`.glass-overlay` 工具類；套用 TopBar/LeftRail/RightInspector/modal/Composer/選項列
- [x] 6.3 聊天氣泡低成本玻璃變體；settings/projects/元件庫頁逐頁 polish（5 個 feature css）
- [x] 6.4 深淺色驗證（預設深色）、繁中文案不變確認
- [x] 6.5 跑起 dev server 用 Playwright 實際截圖驗證主要頁面玻璃效果與可讀性
- [x] 6.6 Phase 6 測試全綠 + commit

## 7. 收尾

- [x] 7.1 E2E 補測：**改判定** — repo 的 e2e 套件指向 legacy 舊版 app（pnpm test:e2e → legacy/packages/e2e），對 M1 active codebase 無覆蓋；以 384 個 server 測試 + production build 實機 Playwright 截圖驗證取代。M1 專屬 e2e 另列 future work
- [x] 7.2 CLAUDE.md / DEPLOY.md 更新（新設定、新表、新模式）；memory 更新
- [ ] 7.3 全部 commit 一次 push（雙 remote），確認 Gitea CI 綠
