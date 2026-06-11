# Proposal: design-quality-replication

## Why

2026-06-11 根因調查確認：設計模式產出品質低落來自六個結構性缺陷 — 修改設計時 AI 看不到目前 artifact 原始碼（只給 ID）、OpenCode 失敗時靜默 fallback 到 gemini-2.5-flash、domain skill 完全未接上設計生成、one-shot 盲生成、單一 artifact 約束、vision 註解過時。同時使用者需要「貼圖片/設計稿照抄」「在既有頁面增量加元件」「精雕後的元件沉澱重用、不再每次重猜」的工作流，以及 client 本身改為 iOS 27 液態玻璃風格。

完整核准設計：`docs/superpowers/specs/2026-06-11-design-quality-replication-design.md`。

## What Changes

- design mode system prompt 注入 active artifact 完整原始碼（>60KB 降級為結構摘要）
- 每 turn 記錄並顯示實際服務的 provider/model（badge），新增「禁止跨模型 fallback」設定
- 新增 `sfcSurgeon` service：SFC template 子樹定位/抽取/替換（雙軌編輯、存元件、元件展開共用）
- 雙軌增量編輯：iframe 選取元素 → 只把子樹給 AI → 原位替換；未選元素走整頁重生（帶完整原始碼）
- 元件庫：`components` table、選取元素存為元件、prompt 注入元件索引、AI 以 `<lib-component name>` 佔位符引用、伺服器**原樣展開**（取代舊 `component-library` change 的「參考重寫」路線）
- 照抄 pipeline：偵測圖片附件/URL → UI 選項列（照抄/只取風格/只當參考）+ AI 並行確認；新增 `replicate` 生成模式（不注入 frontend-design skill、像素忠實、原圖隨 call 附上）
- Domain skill 自動選擇：輕量 selector call 選 0–3 個相關 skill 注入（8K/skill、20K 總上限），斜槓強制時跳過
- Client UI 全面改為 iOS 27 液態玻璃風格（theme.css token 層重寫 + `.glass-*` 工具類，純 CSS）

## Capabilities

### New Capabilities
- `design-generation-context`: design mode 生成 context 完整性（active artifact 原始碼注入、大小降級策略）
- `provider-routing-visibility`: provider/model 服務透明化與 fallback 控制
- `sfc-element-editing`: SFC 子樹抽取/替換與雙軌增量編輯
- `component-library`: 元件沉澱、索引注入、佔位符原樣展開（取代舊 change 的 reference-rewrite 機制）
- `design-replication`: 圖片/設計稿/URL 照抄 intake 與 replicate 生成模式
- `domain-skill-selection`: 設計/顧問生成的 domain skill 自動選擇與注入
- `liquid-glass-ui`: client 介面 iOS 27 液態玻璃視覺系統

### Modified Capabilities
（無 — 既有 specs `css-variable-extraction` / `live-style-injection` / `style-tweaker-panel` 的需求不變）

## Impact

- Server: `routes/chat.ts`, `routes/design.ts`, `services/callProvider.ts`, `services/provider.ts`, `services/chatOrchestrator.ts`, 新增 `services/sfcSurgeon.ts`, `services/componentLibrary.ts`, `services/skillSelector.ts`, `services/replication.ts`, migration（components table、settings key）
- Client: `Composer`（intake 選項列）、`VueSfcPreview`/`DesignStage`（存為元件、元素編輯）、`TurnBubble`（provider badge）、`ProvidersTab`（fallback 開關）、新元件庫頁、全部 styles/*.css（液態玻璃）
- 相依：htmlparser2（或 parse5）新增至 server；其餘零新依賴
- 舊 `openspec/changes/component-library`（未實作）被本 change 取代，標註於其 proposal 不另行刪除
