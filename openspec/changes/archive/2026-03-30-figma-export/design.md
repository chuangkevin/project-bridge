## Context

Project Bridge 每個專案都有一個 `share_token`，可以產生公開預覽 URL（`/share/:token`）。prototype HTML 存在 `prototype_versions` 表中。html.to.design Figma 插件接受 URL 作為輸入。code.to.design 提供 REST API 接受 HTML string。

## Goals / Non-Goals

**Goals:**
- 讓使用者一鍵將 prototype 匯出到 Figma
- 快速路線（免費）：引導使用者用 html.to.design 插件匯入
- 進階路線（付費）：server 呼叫 code.to.design API，回傳可直接貼入 Figma 的剪貼簿資料
- 支援多頁面 prototype 匯出

**Non-Goals:**
- 不自建 HTML → Figma 轉換引擎
- 不開發 Figma 插件（使用第三方插件）
- 不做 Figma → Project Bridge 反向同步

## Decisions

### 1. 匯出對話框設計

匯出按鈕放在工作區 toolbar（與 Preview/Code 同列），點擊後開啟匯出對話框：

```
┌─────────────────────────────────┐
│        匯出到 Figma              │
├─────────────────────────────────┤
│                                 │
│  ⚡ 快速匯出（免費）              │
│  使用 html.to.design 插件匯入    │
│  [複製分享連結]                   │
│  步驟：                          │
│  1. 安裝 html.to.design 插件    │
│  2. 在 Figma 開啟插件           │
│  3. 貼上連結，選擇 viewport      │
│  4. 匯入                        │
│                                 │
│  ─── 或 ───                     │
│                                 │
│  🚀 API 匯出（需設定 API Key）   │
│  自動轉換，Ctrl+V 貼入 Figma    │
│  [選擇 Viewport: Desktop ▼]     │
│  [匯出到剪貼簿]                  │
│                                 │
└─────────────────────────────────┘
```

### 2. code.to.design API 整合

Server 端新增端點，呼叫 code.to.design API：

```typescript
// POST /api/projects/:id/export/figma
// Body: { viewport: 'desktop' | 'tablet' | 'mobile', page?: string }
// Response: { clipboardData: string } — 可直接寫入剪貼簿

const response = await fetch('https://api.to.design/html', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    html: prototypeHtml,
    width: viewport === 'mobile' ? 390 : viewport === 'tablet' ? 768 : 1440,
    clip: true, // clipboard mode
  }),
});
```

### 3. API Key 管理

code.to.design API key 存在 settings 表（key: `code_to_design_api_key`）。在設定頁的 API Keys 區域新增欄位。沒有 key 時，API 匯出按鈕 disabled + 提示去設定。

### 4. 分享連結確保

匯出前自動確認 prototype 有公開分享頁面可存取。如果還沒有（share route 沒建），自動產生 share URL。現有的 `/share/:token` 路由已經可以渲染 prototype。

## Risks / Trade-offs

- **[code.to.design 成本]** 每次 API 呼叫消耗 1 credit → 在 UI 提示使用者，預設推薦免費路線
- **[code.to.design 可用性]** 第三方服務可能停機 → 快速匯出作為 fallback 永遠可用
- **[HTML 轉換品質]** 複雜 CSS（grid, flexbox）可能在 Figma 中失真 → 不可控，由第三方工具處理
- **[多頁面]** code.to.design 的 `html-multi` endpoint 支援多頁面 → 使用此端點
