## Context

現有架構：
- `intentClassifier.ts` — AI 分類 intent（full-page / micro-adjust / question / component / in-shell）
- `chat.ts` line 226-266 — keyword regex + AI classifier + downgrade 邏輯
- `micro-adjust.txt` prompt — 只處理 CSS 調整，輸入是整個 HTML + 使用者指令
- `VisualEditor.tsx` — 已有元件選取（click → get bridgeId + rect）、拖拉、resize、style patch
- `bridgeScript.ts` — iframe 內有 element-click 事件、annotation mode、visual-edit mode
- `PreviewPanel.tsx` — 接收 iframe message、管理 interaction mode

## Goals / Non-Goals

**Goals:**
- 使用者在已有原型上的小幅請求（加 tag、改文字、調顏色）不會觸發全頁重生成
- 使用者可以在 iframe 裡點選元件，然後在 chat 描述修改，AI 只改那個元件
- micro-adjust 能處理 HTML 結構變更（加/刪元素），不只 CSS

**Non-Goals:**
- 不做拖拉排版（已有 VisualEditor 處理）
- 不做跨頁面的批量修改
- 不需要「undo」功能（用歷史版本回退）

## Decisions

### 1. 三級 intent 取代二元分類

**選擇：** 保留現有 intentClassifier 的 AI call，但在 chat.ts routing 層加入更精確的降級邏輯：

| 條件 | 走哪條路 |
|------|---------|
| 沒有原型 | → full-page（always） |
| 有原型 + 明確要重做（「重新設計」「重做」） | → full-page |
| 有原型 + 明確要加新頁面（「加一個XX頁」） | → full-page |
| 有原型 + 選中了元件 + 描述修改 | → element-targeted-adjust（新） |
| 有原型 + 描述小幅修改（不含「做一個」「設計」等生成詞） | → micro-adjust |
| 有原型 + 含「設計」但上下文是微調（「設計稿上加個 tag」） | → micro-adjust |

**關鍵改動：** `isObviousGenerate` 的 regex 要排除微調動詞（「加上」「改成」「調整」在已有原型時不算生成）。

### 2. Element-targeted adjust 流程

**選擇：** 復用現有的 annotate mode click 機制。

```
使用者在 sidebar 切到「微調」模式
→ iframe 進入 element-select mode（click 選元件，不是 annotate）
→ 使用者點選元件 → 高亮 + 顯示 bridgeId
→ ChatPanel 顯示「已選中：[元件名]」context bar
→ 使用者輸入修改指令（「加一個 tag」「改成紅色」）
→ server 收到 { message, targetBridgeId, targetHtml }
→ AI 只修改那段 HTML，回傳 patch
→ client 替換 iframe 中的元件
```

**理由：** 不需要新的 iframe interaction mode — 復用 annotate 的 click → bridgeId 機制，只是把後續動作從「加標注」改為「AI 修改元件」。

### 3. Micro-adjust prompt 支援 HTML 修改

**選擇：** 新增 `element-adjust.txt` prompt，input 是選中元件的 HTML 片段（不是整頁），output 是修改後的 HTML 片段。

**理由：** 只送元件 HTML 而不是整頁，大幅減少 token 用量（200 tokens vs 20000 tokens），AI 也更精準。

**替代方案：** 把整頁 HTML 送去讓 AI 找到並修改 → token 太多，AI 容易改到不該改的地方。

### 4. Chat input 帶 element context

**選擇：** 當使用者選中元件後，chat API 多傳兩個欄位：
```json
{ "message": "加一個紅色 tag", "targetBridgeId": "product-card-1", "targetHtml": "<div class='card'>...</div>" }
```

server 看到 `targetBridgeId` 就走 element-targeted-adjust 路徑，不走 intent classifier。

## Risks / Trade-offs

- **HTML 片段替換可能破壞結構** → 替換後跑 div balance check，失敗就回退
- **使用者不知道要先選元件** → UI 加一個明顯的「點選元件微調」按鈕在 toolbar
- **AI 可能改出跟周圍不一致的樣式** → prompt 要求使用相同的 CSS 變數和 class
