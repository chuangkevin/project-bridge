## Context

建立在 Phase 1+2+Design Profile 基礎上。三個功能獨立，共用同一個 change。

## Goals / Non-Goals

**Goals:**
- 意圖辨識：準確區分「問問題」和「生成 UI」
- 規格文件圖片提取：PDF/PPT 內嵌圖片可被提取並分析
- 美術風格 Switch：獨立於 Design Profile，不互相覆蓋
- 多頁面：生成真正可互動、可導覽的多頁面原型

**Non-Goals:**
- 語音問答
- 複雜的 RAG / 向量搜尋（不需要，對話歷史本身就是上下文）
- 每個頁面獨立的 HTML 檔案（保持單檔策略）
- 圖片直接嵌入生成的原型

---

## 功能 1：Q&A 回應模式

### 意圖辨識策略

**做法：在送給 OpenAI 前先分類**

在 chat route，在組裝主要 prompt 之前，用一次快速的 API call 分類意圖：

```
System: You are an intent classifier. Classify the user's message as either:
- "generate": User wants to create or modify a UI/prototype
- "question": User is asking a question about specs, the prototype, design, or anything else

Reply with only one word: "generate" or "question".

User: {message}
```

用 `gpt-4o-mini`（快速便宜），max_tokens: 5。

**為何不用關鍵字比對**：規則太脆弱，例如「這個按鈕要怎麼設計？」既是問題也可能是生成請求。AI 分類更準確。

**問答模式的回應**：
- 不加 `data-bridge-id` 指令
- system prompt 改為：「你是一個產品助手，回答使用者關於規格、設計、或原型的問題。請用繁體中文簡潔回答。可以參考對話歷史和提供的規格文件。」
- 回應用 SSE 串流（保持體驗一致）
- 完成後**不**建立新的 PrototypeVersion，不更新原型
- conversation role 維持 user/assistant，但 assistant 的 content 加上 metadata `{ type: 'answer' }`（存在 DB，讓前端區分）

### 前端視覺差異

- 「生成」訊息：assistant 泡泡有灰色背景 + 程式碼字型 + 「已生成原型」tag
- 「問答」訊息：assistant 泡泡有藍色邊框 + 正常字型 + 💬 icon

---

## 功能 2：美術風格自動偵測

### 圖片提取策略

| 格式 | 方法 |
|------|------|
| PDF | pdf-parse 只取文字，圖片提取需用 `pdf2pic` 或 `pdfjs-dist`。選用 `pdfjs-dist` 的 canvas renderer，逐頁 render 成圖片，取前 3 頁 |
| PPTX | 解壓 .pptx（ZIP），讀取 `ppt/media/` 目錄下的圖片 |
| DOCX | 解壓 .docx（ZIP），讀取 `word/media/` 目錄下的圖片 |
| 圖片直接上傳 | 直接使用 |

取前 3 張圖片（防止費用過高），送 Vision API 分析。

**分析 Prompt**（與 Design Profile 的 analyze-reference 相同邏輯，但強調美術/視覺風格）：
```
These images are from a product specification document. Analyze the visual/art style you observe:
1. Visual style (flat/skeuomorphic/material/glassmorphism/neomorphism/etc.)
2. Color mood (warm/cool/neutral/vibrant/muted)
3. Illustration style if any (line art/isometric/3D/photographic/minimal)
4. UI density (information-dense/balanced/spacious)
5. Tone (corporate/playful/technical/creative)
Summarize in 2-3 sentences that an AI can use to reproduce this visual style.
```

### Switch 邏輯

- 後端 `art_style_preferences` 表：`project_id, detected_style TEXT, apply_style BOOLEAN DEFAULT FALSE, updated_at`
- 當文件上傳完成且有圖片時，自動分析並存入 `detected_style`
- 前端在對話面板顯示「偵測到美術風格」提示卡（只有在 `detected_style` 非空時出現）
- Switch 切換：PUT `art_style_preferences.apply_style`
- Chat 生成時：若 `apply_style = true`，在 prompt 中加入 art style block（在 Design Profile block 之後）

### 注意：Switch 與 Design Profile 的關係

兩者獨立疊加，都開啟時都注入，AI 自行平衡。如果衝突（例如 Art Style 說「暗色系」但 Design Profile 說「白色主色」），Design Profile 優先（在 prompt 中明確說明）。

---

## 功能 3：多頁面層級設計

### 頁面偵測策略

**做法：讓 AI 在生成前先分析是否需要多頁面**

在送出生成請求前，加一步分析（同樣用 gpt-4o-mini 快速 call）：

```
System: You are a UI structure analyzer. Given the user's requirements, determine if they describe multiple distinct pages/screens.

If multiple pages: reply with JSON {"multiPage": true, "pages": ["Page Name 1", "Page Name 2", ...]} (max 8 pages)
If single page: reply with JSON {"multiPage": false, "pages": ["Main"]}

Only include distinct, meaningful screens. Don't split trivial variations.
```

### 生成策略

**單頁**：維持現有行為。

**多頁**：修改生成 prompt，加入多頁面指令：

```
=== MULTI-PAGE STRUCTURE ===
Generate a complete multi-page prototype as a SINGLE HTML file.
Pages to include: {page list}

Requirements:
- Use a fixed navigation sidebar or top nav to switch between pages
- Each page is a <div class="page" data-page="{page-name}"> initially hidden (display: none)
- The first page is visible by default
- Navigation links use JavaScript to show/hide pages (no page reload)
- The nav highlights the current active page
- Each page should be fully designed and functional
============================
```

### 前端「頁面導覽列」

- 當原型是多頁面時，iframe 上方顯示頁籤列（從生成的 HTML 解析 `data-page` 屬性）
- 點擊頁籤：向 iframe 發送 postMessage `{ type: 'navigate', page: 'page-name' }`
- iframe 的 bridge script 監聽並切換頁面

### DB

- `prototype_versions` 表新增欄位 `is_multi_page BOOLEAN DEFAULT FALSE` 和 `pages TEXT JSON`（頁面名稱列表）

---

## Risks / Trade-offs

- **意圖分類費用**：每則訊息多一次 gpt-4o-mini call（約 $0.000015）。可接受。
- **PDF 圖片提取**：`pdfjs-dist` 在 Node.js 環境需要 canvas package。改用更簡單策略：對 PDF 只取前 3 頁 render 成圖片。若 canvas 難以安裝，降級為「僅 PPTX/DOCX 提取圖片，PDF 跳過」。
- **多頁面 HTML 體積**：可能很大，但仍是單檔，保持架構一致性。
- **頁面偵測假陽性**：若 AI 誤判為多頁，PM 可以重新描述。無需完美。
