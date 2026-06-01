# DesignBridge M1 — Release Smoke Checklist

> 對應 [`docs/M1-CHARTER.md`](../M1-CHARTER.md) § 5 的 10 條驗收標準。
> 每個 box 都要實際操作後打勾。**全部打勾 = M1 可上線。**

**先決條件：**
- [ ] server build clean: `pnpm --filter @designbridge/server build`
- [ ] client build clean: `pnpm --filter @designbridge/client build`
- [ ] server tests all green: `pnpm --filter @designbridge/server test`
- [ ] 啟動 dev: `pnpm --filter @designbridge/server dev` + `pnpm --filter @designbridge/client dev`
- [ ] 環境變數：`PUBLIC_BASE_URL`, `OPENAI_OAUTH_CLIENT_ID`（如要 OAuth）, `GEMINI_API_KEY` 或設定頁加 key

---

## 1️⃣ 登入 → 建立 / 共享專案

- [ ] 開 `/` 第一次安裝 → 看到 `/setup` 表單
- [ ] 填 email + 密碼（≥ 8 字元）→ 自動登入 → 跳 `/projects`
- [ ] 點「新增專案」→ 輸入名稱 → 出現在清單
- [ ] 重新整理 → 仍登入，仍看到專案
- [ ] 點「下載備份」→ 收到 `.tar.gz` 檔（Plan 15）
- [ ] 解壓檔 → 有 `manifest.json` + `uploads/` + `artifacts/`

## 2️⃣ 顧問模式：對話 + thinking bubble + 上傳

- [ ] 點專案 → 進入 workspace，模式預設「顧問」
- [ ] 輸入「幫我規劃一個記帳 App」按 Enter
- [ ] **觀察到 phase indicator 動畫**（脈動圓點 + 「讀取專案記憶 / 選擇技能 / 推理中 / 回答中」）
- [ ] AI tokens 開始流入，最後生成完整回應
- [ ] 點「顯示推理」→ 看到 AI 的思考過程（如果回應有 `<thinking>` block）
- [ ] 點 📎 上傳一個 PDF → chip 顯示 → 送出 → AI 在回應中提到附件內容
- [ ] 輸入 `/` → slash autocomplete 出現技能列表
- [ ] 選一個技能 → 文字變成 `/skill-name `
- [ ] 重新整理頁面 → 對話歷史還在（左欄記憶池）

## 3️⃣ 架構模式：page graph

- [ ] 切換到「架構」模式
- [ ] 對話：「幫我設計這個 App 的頁面結構，包含登入、首頁、新增帳目、報表頁」
- [ ] AI 回應 + **graph 出現節點 + 連線**
- [ ] 拖拉節點可以移動（位置不會自動回去 — 至少當下 session 內）
- [ ] 切回顧問 → 切回架構 → graph 還在

## 4️⃣ 設計模式：Vue SFC iframe preview

- [ ] 切到「設計」模式
- [ ] 對話：「幫我做一個記帳 App 的首頁，要有摘要卡 + 最近 3 筆紀錄」
- [ ] AI 回應 + **iframe 顯示 Vue + Tailwind 渲染的畫面**
- [ ] 點右上「隱藏原始碼 / 顯示原始碼」toggle
- [ ] 點「複製」→ paste 出來是 Vue SFC 原始碼
- [ ] 再對話：「新增按鈕」→ 新版本顯示，page 下拉選單可切回舊版

## 5️⃣ 跨模式記憶共用

- [ ] 從步驟 4 的設計模式切回顧問
- [ ] 問：「我前面講的記帳 App 預算目標是多少？」
- [ ] AI 應該基於前面對話回答；若還沒講過，至少要記得「記帳 App」這個主題（不會問 "什麼 App?"）
- [ ] 看左欄 facts 區塊 → 有幾個從對話自動抽出的事實（requirement / page / constraint）

## 6️⃣ 合議制 Council

- [ ] 顧問模式 → 勾選「合議模式」
- [ ] 對話：「我該用 SQL 還是 NoSQL 存記帳資料？」
- [ ] **依序看到 4 個 persona 的回應**：PM → Designer → Engineer → Moderator
- [ ] active persona 有特殊高亮（左邊紫色邊框）
- [ ] 完成後該 turn 在 transcript 中可展開「顯示合議討論」看到所有 persona 內容
- [ ] 取消勾選 → 下次回到正常單一回應

## 7️⃣ 設定頁

- [ ] 進 `/settings`
- [ ] **AI 供應商 tab**：
  - 加一把 Gemini key → 看到「已設定」mask
  - 清除 → 再加同 key → AI 仍可工作（驗證 invalidateProvider）
- [ ] **技能庫 tab**：
  - 看到所有 built-in skills（包含 council-* 等）
  - 新增一個全域 skill（name: my-test, description, body）→ 出現在列表
  - 在 chat 用 `/my-test` → AI 收到該 skill 作為強制 context
  - 刪除 my-test → 從列表消失
- [ ] **關於 tab**：顯示版本資訊

## 8️⃣ 多人即時同步

- [ ] 在 tab A 進專案 → 同帳號在 tab B 進同專案
- [ ] tab A 送一條 chat
- [ ] **tab B 立即看到 turn 出現在 transcript 與 LeftRail**（≤ 1.5 秒，不需重新整理）
- [ ] tab A 在設計模式產生 artifact → tab B 自動更新 artifact 選單
- [ ] 中斷 tab A 網路 → 恢復 → socket 自動重連（Network panel 看到 reconnect）

## 9️⃣ 平板 / 手機

- [ ] Chrome DevTools 切 iPhone SE (375×667)
- [ ] 看到 hamburger ☰ 取代左欄
- [ ] 模式 tab 變成下拉選單
- [ ] 點 ☰ → 抽屜從左滑出
- [ ] 聚焦 composer textarea → 鍵盤跳出但 composer **仍可見**（sticky bottom）
- [ ] textarea 字級看起來不會自動 zoom（16px）
- [ ] 旋轉裝置 → 架構模式 graph 自動 fit view
- [ ] 設定頁 tab 列可水平捲動

## 🔟 備份 + 維護

- [ ] `/projects` 對每個專案有「下載備份」按鈕
- [ ] 下載一個專案備份 → 檔名 `designbridge-<name>-<timestamp>.tar.gz`
- [ ] 解壓 → manifest 含 turns / facts / artifacts / attachments / project_skills
- [ ] 運行：`pnpm --filter @designbridge/server maintenance ./packages/server/data`
- [ ] 看到 size before / after / vacuum 訊息

---

## a11y 抽檢

- [ ] 全鍵盤操作：Tab 走過 topbar 所有按鈕，每個都有可見 focus ring
- [ ] Composer 用鍵盤可送出（Enter）
- [ ] 收合面板用鍵盤 Enter 可觸發
- [ ] 開瀏覽器 DevTools Lighthouse → `/projects/:id` 跑 a11y → 分數 ≥ 90
- [ ] 設定 prefer-reduced-motion → 脈動圓點不再動

---

## 已知不在 M1 範圍（非阻塞）

- AI 偶爾生成不可編譯的 Vue SFC → preview 顯示錯誤橫幅（這是 design AI 品質問題，不是 bug）
- xyflow 節點手動拖完位置 reload 不持久（M2）
- 連 OpenAI OAuth 在某些瀏覽器需要允許 popup（document 在設定頁）
- 截圖 paste 從剪貼簿（spec § 2.4 列出但 M1 落地是 📎 上傳；M2 加 paste handler）

---

## 通過條件

**全部 prerequisites + 10 個編號 section + a11y 抽檢全部打勾 → M1 上線。**
失敗任一條 → 開 issue → 修 → 重跑該 section。
