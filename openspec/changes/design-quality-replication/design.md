# Design: design-quality-replication

完整背景與決策紀錄見已核准的 `docs/superpowers/specs/2026-06-11-design-quality-replication-design.md`。本文件聚焦實作層技術決策。

## Context

- 生成鏈：`routes/chat.ts` → `buildSystemPrompt()`（chatOrchestrator）→ `callProvider()` → ai-core `MultiProviderClient`（OpenCode primary → Gemini key-pool → OpenAI）。
- 已驗證事實：ai-core v3.4.1 OpenCode adapter 支援 multimodal（`sendMessage` 轉 image parts）；OpenCode `generateContent` 路徑忽略 `params.history`（沒人在傳，對話記憶全靠 system prompt 文字）；route policy `allowCrossModelFallback: true` 會讓 gemini-2.5-flash 靜默頂替 gpt-5.5；`turns.model_used` 欄位已存在但未寫入實際 selection。
- 預覽 iframe 已支援元素點選互動（Phase C，e72e684）；client 為純 CSS（theme.css 88 行 token + 5 個 feature css）。
- 舊 `openspec/changes/component-library`（未實作）採「注入元件原始碼供 AI 參考重寫」— 使用者明確否決，本 change 改為佔位符原樣展開。

## Goals / Non-Goals

**Goals:** 見 proposal「What Changes」八項。

**Non-Goals:** 生成後截圖自動迭代 loop、多頁 artifact 拆分、skill 自動學習、OpenCode server 端 agent 設定調整。

## Decisions

### D1: active artifact 原始碼放 system prompt 而非 history
沒人傳 `history` 且 OpenCode adapter 會丟棄它 — 放 system prompt 是唯一在三個 provider 路徑都生效的位置。60KB 門檻內全文注入；超過則注入結構摘要（v-if 頁面清單、nav 標籤、元件名）+ 明確警告。替代方案（傳 history）被 OpenCode adapter 行為否決。

### D2: selection 取得方式 — `generateWithSelection` / `streamWithSelection`
實測 ai-core dist：`streamWithSelection` 回傳 `{selection, stream}` 且 **executeStream 沒有 mid-stream cross-candidate fallback**（eager 選定即開流，失敗直接拋錯）— 流式 selection 是準的；`generateWithSelection` 在 execute() 候選迴圈成功後回傳實際勝出 selection。兩者皆免 correlation 機制，原 AsyncLocalStorage 方案不需要。`callProvider` 增加 `onMeta` callback 把 `{provider, model, fallback}` 交給呼叫端；`fallback := selection.model !== requestedModel`（provider 切換但同 model 屬合法配置路徑，badge 仍會顯示 provider 讓使用者看見）。
附帶事實更正：「靜默 fallback 到 flash」只發生在**非流式**呼叫（design.ts variants/regenerate、extractor 等）；主聊天流式路徑會直接報錯而非降級 — badge + 可關閉 fallback 仍涵蓋兩者。

### D3: `disallow_model_fallback` 的語意
設定 ON 時 route policy 建構為 `allowCrossModelFallback: false`（cross-provider 仍允許 — Gemini adapter 若恰好支援同名 model 才可承接，等於實質禁止 flash 頂替 gpt-5.5）。不直接關 `allowCrossProviderFallback`，保留 OpenAI credential 承接 gpt-* 的合法路徑。

### D4: sfcSurgeon 用 htmlparser2 + dom-serializer
Vue template 是 HTML 超集（`@click`、`v-if`、`{{ }}`）。htmlparser2 對非標準屬性容忍度高且 round-trip 穩定（`recognizeSelfClosing: true`、保留原始大小寫）。parse5 會做 HTML5 規格化（自動補 tbody 等）破壞 round-trip — 不用。元素定位用「結構路徑」（tag + 第 n 個同名子節點，preview iframe 端以同演算法產生路徑），不用 CSS selector（v-for 重複節點會歧義）。替換後 re-parse 驗證單根與配對完整，失敗自動降級整頁軌道。
`<style>` 區塊處理：抽取元素時連同 class 名稱比對抓出相關 CSS 規則（樸素字串比對 class token，寧多勿漏）。

### D5: 元件展開時機在 artifact 解析後、入庫前
`parseArtifactsFromResponseWithFallback()` 之後對 payload 跑 `expandLibComponents()`：以 htmlparser2 找 `<lib-component name="..."/>`，以同 scope（project → global）查表原樣替換 template，並把元件 style 合併進 SFC `<style>`（去重）。未知名稱 → SSE `error` 事件 + 該佔位符替換為帶警告註解的空 div（artifact 仍可預覽，不整筆作廢）。

### D6: replicate 模式的 prompt 組成
`MODE_SYSTEM_PROMPT['replicate']`：保留 artifact 輸出格式規則（單一 artifact、Tailwind、no script setup），**不含** frontend-design skill，改像素忠實指令（克隆 layout/spacing/字級/色值，不得「改良」）。圖片經 `params.images` 附上（OpenCode GPT 5.5 multimodal 已驗證支援）；流式路徑同樣帶 images。Gemini 備援：`geminiVisionQuery` 先產結構化規格 JSON（色票/字體/區塊樹），再以文字規格進 replicate 生成。
URL 照抄：重用既有 crawl-full-page cleaned HTML（截 30K 字）+ computed style 摘要進 prompt。

### D7: intake 偵測在 client、決策記錄在 turn
Composer 偵測 image attachment / URL regex → 顯示選項列（照抄/只取風格/只當參考 × 新 artifact/插入選定區域）。選擇結果作為 `replicationIntent` 欄位隨 chat request 送出；未選擇時 server 在 system prompt 加一句「使用者附了圖/URL 但未表明意圖，回覆開頭先確認是否照抄再動工」（雙保險）。

### D8: skill selector 用 defaultModel + withJsonInstruction
一次輕量呼叫（maxOutputTokens 512、skill 索引 + 使用者訊息 → JSON `{"skills": []}`），`extractJsonBody` parse。失敗（throw/parse 不出）→ 空清單繼續生成 + console.warn。選中 skill body 注入截斷：單一 8K 字、總計 20K 字。結果寫 `turns.skills_used`。設計與顧問模式都走；斜槓強制 skill 時跳過 selector。

### D9: 液態玻璃以 token 層為單一事實來源
`theme.css` 重寫為三層：`--glass-*` 材質 token（背景 rgba、blur 半徑、邊框高光、陰影組）、語意 token（`--surface-floating`、`--surface-chrome`…）、舊 token 名保留指向新值（5 個 feature css 不需全改即可吃到新材質）。新增 `.glass-panel`/`.glass-capsule`/`.glass-overlay` 工具類給重點表面（TopBar、LeftRail、modal、聊天氣泡、選項列）。`@supports not (backdrop-filter: blur(1px))` 降級實色。動畫統一 `--spring: cubic-bezier(0.34, 1.3, 0.64, 1)`。

## Risks / Trade-offs

- [sfcSurgeon round-trip 改壞 template] → 替換後 re-parse 驗證 + 失敗降級整頁軌道 + 大量 round-trip 單元測試（含 v-if/v-for/slot/註解/中文內容）
- [流式 selection correlation 在併發下錯置] → AsyncLocalStorage 包裹；單元測試模擬兩個並發 stream
- [元件 style 與頁面 style 衝突] → **實作時放棄 class 前綴化**：前綴會破壞「template 逐字元原樣展開」的 spec 要求（驗收測試要求 byte-identical）。實際緩解：元件 css 以原文去重合併進 style 區塊；元件主要使用 Tailwind class，自訂 css 衝突風險低且可由使用者改名元件 class 解決
- [vision 經 OpenCode 在特定 server 仍可能失敗] → try/catch 後自動走 geminiVisionQuery 規格路徑，SSE 告知使用者目前用文字規格重建（不靜默）
- [液態玻璃 backdrop-filter 效能（大量層疊）] → 限制同屏 glass 表面數（聊天氣泡用低成本變體：無 blur 只有透明+邊光）
- [selector call 增加每次生成延遲] → 與主生成前置並行不可行（結果要進 prompt），接受 ~1-2s；UI phase 顯示「挑選知識中」

## Migration Plan

- DB migration：新增 `components` table + `settings.disallow_model_fallback` 預設 off。向下相容，無破壞性。
- 部署後行為改變僅追加（badge、選項列）；舊專案 artifact 不需轉換。
- Rollback：revert commits 即可，migration 留表無害。

## Open Questions

（無 — 關鍵決策已由使用者於 2026-06-11 拍板：方案一、雙保險 intake、元素級沉澱、原樣展開、完整版 skill selector、全範圍一次做）
