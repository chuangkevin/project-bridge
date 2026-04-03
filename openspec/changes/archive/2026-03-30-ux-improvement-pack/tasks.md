## 1. DB Migration

- [x] 1.1 新增 migration SQL：`uploaded_files` 加 `intent TEXT` 欄位
- [x] 1.2 新增 migration SQL：`projects` 加 `generation_temperature REAL DEFAULT 0.3` 欄位
- [x] 1.3 新增 migration SQL：`projects` 加 `seed_prompt TEXT` 欄位
- [x] 1.4 在 `db/connection.ts` 或 migrations runner 中執行新 migration

## 2. 後端 API — File Intent Labeling

- [x] 2.1 擴充 `PATCH /:id/upload/:fileId/label` endpoint：支援 `intent` 欄位（接受 `design-spec | data-spec | brand-guide | reference | null`）
- [x] 2.2 在 `GET /api/projects/:id/files`（或現有的 upload list endpoint）回傳中加入 `intent` 欄位

## 3. 後端 API — Generation Consistency

- [x] 3.1 在 `POST /api/projects/:id/chat` route 讀取 project 的 `generation_temperature`，傳入 `openai.chat.completions.create` 的 `temperature` 參數
- [x] 3.2 在 `POST /api/projects/:id/chat` route 讀取 project 的 `seed_prompt`，若非空則在 `userContent` 前 prepend `[Generation Seed]\n${seedPrompt}\n\n`
- [x] 3.3 新增 `PATCH /api/projects/:id/settings` endpoint，支援更新 `generation_temperature` 和 `seed_prompt`

## 4. 後端 API — Intent-aware Prompt Injection

- [x] 4.1 修改 `chat.ts` 的 extracted_text 注入邏輯：若文件有 `intent` 值，在文件前加對應的角色 preamble（參見 spec: file-intent-labeling）
- [x] 4.2 修改 `chat.ts` 的 `designSpecPrefix` 注入邏輯：若 fileIds 中有 `intent = 'design-spec'` 的文件，優先以這些文件的 visual_analysis 作為 design spec prefix

## 5. 前端 — File Intent Dropdown

- [x] 5.1 在 ChatPanel 的 uploaded files 清單中，每個文件旁加 intent 選擇器（下拉或 segmented control），選項：設計稿、資料規格、品牌指南、參考截圖、（未分類）
- [x] 5.2 選擇後呼叫 PATCH endpoint 更新 intent，並更新 local state
- [x] 5.3 頁面載入時從 API 取得每個文件的 `intent` 值並初始化 UI

## 6. 前端 — Generation Consistency Controls

- [x] 6.1 在 ChatPanel 新增可折疊的「生成設定」區塊（預設收合）
- [x] 6.2 「生成設定」中加入 Temperature slider（0.0–1.0, step 0.1, 預設值從 project 讀取）
- [x] 6.3 「生成設定」中加入 Seed Prompt textarea，並在 blur 時 PATCH 儲存
- [x] 6.4 送出 chat 訊息時，將 project 的 temperature 和 seed prompt 透過 body 傳給 server（或 server 自行從 DB 讀取，以 server-side 讀取為優先）

## 7. 前端 — 色彩偏差警示

- [x] 7.1 實作 `extractDominantColors(html: string): string[]`：用 regex 掃描 CSS 色彩值，回傳 top-3 hex 色
- [x] 7.2 實作 `rgbDistance(a: string, b: string): number`：計算兩個 hex 色的 RGB 歐式距離
- [x] 7.3 在 PreviewPanel 生成完成後，與 project 的 design spec primary color 比對（從 `visual_analysis` 中提取或從 API 讀取）
- [x] 7.4 若距離 > 80，在 PreviewPanel 頂部顯示「色彩偏差」badge，顯示設計稿色與生成色對比色塊

## 8. 前端 — Prototype Drag Edit

- [x] 8.1 在 PreviewPanel 新增「拖放微調」toggle button，進入 drag mode 時顯示提示 banner
- [x] 8.2 drag mode 開啟時，在 iframe 上方疊透明 overlay div（pointer-events: all）
- [x] 8.3 偵測 mousemove 找到游標下方的 `data-bridge-id` 元素並加 highlight outline
- [x] 8.4 mousedown 記錄起始位置，mousemove 即時更新目標元素的 `style.transform = translate(dx, dy)`（透過 iframe.contentDocument 操作）
- [x] 8.5 mouseup 確認拖放，從 `iframe.contentDocument.documentElement.outerHTML` 讀取更新後的 HTML 並寫回 parent state
- [x] 8.6 退出 drag mode 時清除所有 highlight outline 和 overlay
