## Context

現有架構：
- `parallelGenerator.ts` — 並行生成 N 頁，有 pre-assembly gate 和 batch retry
- `htmlQaValidator.ts` — 事後 QA report
- `project_lessons` 表 — 存 QA 失敗 pattern
- `htmlAssembler.ts` — 組裝 + fallback div for failed pages
- `subAgent.ts` — 單頁 HTML fragment 生成
- `ChatPanel.tsx` — SSE 串流顯示生成進度

## Goals / Non-Goals

**Goals:**
- 品質有疑慮的頁面自動提供 2-3 個版本供使用者選擇
- 使用者可以在任何頁面主動要求「給我其他方案」
- 替代方案避免重複上次的錯誤（lesson 注入）
- 選擇 UI 直觀 — iframe 預覽，一鍵選擇

**Non-Goals:**
- 不做所有頁面都跑 3 版（太貴）
- 不做即時 side-by-side 編輯（太複雜）
- 不做方案合併（A 的標題 + B 的卡片）

## Decisions

### 1. 觸發條件與優先順序

| 觸發 | 時機 | 成本 |
|------|------|------|
| Gate 失敗 | 生成時 gate retry 後仍不滿意 | +2 calls |
| QA lesson 存在 | 同專案再次生成時，有 lesson 的頁面 | +2 calls |
| 使用者主動 | 點「🔄 其他方案」按鈕 | +2 calls |

最多同時 2 頁需要方案選擇（避免 API 爆量），其餘用 auto-retry。

### 2. 替代方案的差異化

**不只是 retry 兩次** — 每個替代方案用不同的 prompt 策略：

- **方案 A（原版）**：標準 sub-agent prompt
- **方案 B（結構導向）**：prompt 加「重點在清晰的資訊架構和導航，用 .table 和 .form-group 結構化呈現」
- **方案 C（視覺導向）**：prompt 加「重點在視覺吸引力，用 .card grid 和圖片佔位呈現，hero section 要搶眼」

**理由：** 不同 prompt 策略讓 3 版有明顯差異，而不是 3 個幾乎一樣的結果。

### 3. 前端方案選擇 UI

生成完成後，如果有頁面需要選擇，SSE 推送：
```json
{
  "type": "variant-select",
  "page": "物件詳情",
  "variants": [
    { "id": "a", "label": "方案 A：標準版", "html": "<div class='page'>..." },
    { "id": "b", "label": "方案 B：結構導向", "html": "<div class='page'>..." },
    { "id": "c", "label": "方案 C：視覺導向", "html": "<div class='page'>..." }
  ]
}
```

ChatPanel 渲染：
```
┌─────────────────────────────────────────────┐
│ 📋 「物件詳情」有 3 個方案，請選擇：          │
│                                             │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│ │ 方案 A   │ │ 方案 B   │ │ 方案 C   │       │
│ │ 標準版   │ │ 結構導向  │ │ 視覺導向  │       │
│ │ ┌─────┐ │ │ ┌─────┐ │ │ ┌─────┐ │       │
│ │ │mini │ │ │ │mini │ │ │ │mini │ │       │
│ │ │view │ │ │ │view │ │ │ │view │ │       │
│ │ └─────┘ │ │ └─────┘ │ │ └─────┘ │       │
│ │ [選這個] │ │ [選這個] │ │ [選這個] │       │
│ └─────────┘ └─────────┘ └─────────┘       │
└─────────────────────────────────────────────┘
```

每個方案用 `<iframe srcDoc={html} sandbox="..." />` 縮小顯示。

### 4. 選擇後的替換

使用者選了方案 B → client 發 POST 到 `/api/projects/:id/select-variant`：
```json
{ "page": "物件詳情", "variantId": "b", "variantHtml": "<div class='page'>..." }
```

Server 在完整 HTML 中用 `replaceElementByBridgeId` 或 page-level 替換，存為新版本。

### 5. 使用者主動觸發「其他方案」

在 WorkspacePage 的頁面列表（sidebar）每個頁面旁加 `🔄` 按鈕。點擊後：
1. 提取當前原型中該頁面的 HTML
2. 用 2 個替代 prompt 生成方案 B、C
3. 連同原版推送 variant-select 事件
4. 使用者選擇後替換

## Risks / Trade-offs

- **+2 API calls per variant page** → 限制最多同時 2 頁觸發，其餘 auto-retry
- **方案差異可能不大** → 用不同 prompt 策略（結構 vs 視覺）確保差異
- **iframe 預覽太小看不清** → 用 transform: scale(0.5) 縮放，加 hover 放大
- **SSE payload 大（3 份 HTML）** → 每個 variant 的 HTML 壓縮後 ~10KB，3 個 ~30KB，可接受
