## Context

project-bridge 是一個 AI 驅動的 UI 原型生成工具。設計師反映三個協作斷點：

1. **設計稿意圖不明確**：上傳 PDF/圖片後，AI 無從判斷這份文件是設計稿、資料規格還是品牌指南。目前所有文件都用同樣的 prompt 段落注入，AI 只能猜測如何使用。
2. **生成結果不穩定**：temperature 預設偏高（OpenAI 預設 1.0），加上沒有基準 seed prompt，每次生成的佈局/色彩差異大，設計師必須反覆提示。
3. **生成後無法微調**：要改任何細節（移動一個按鈕、調整卡片位置）都必須重新生成，沒有輕量編輯路徑。

## Goals / Non-Goals

**Goals:**
- 每份上傳文件可標注用途類型，注入 prompt 時帶入明確角色說明
- Temperature 預設降至 0.3；支援 project-level seed prompt 讓生成有固定起點
- 生成後顯示色彩差異警示（對比設計稿的主色）
- Preview 面板支援拖移 `data-bridge-id` 元素調整位置，回寫 HTML

**Non-Goals:**
- 不做元素大小縮放（只做位置移動）
- 不做 undo/redo stack（MVP 版本）
- 不做跨頁面元素拖移
- 色彩比對不需達到像素級精確，主色提取即可

## Decisions

### D1: 文件用途標注儲存在 DB 欄位，注入時插入角色說明段落

**選擇**：在 `uploaded_files` 加 `intent TEXT` 欄位（`design-spec` | `data-spec` | `brand-guide` | `reference`），inject 時在文件前加對應說明段落（例如 `[DESIGN SPEC — Use these colors, layout patterns, and component styles exactly]`）。

**為何不用 tag 系統**：intent 是互斥的單一分類，不需要多標籤複雜度。NULL = 未標注，注入時用通用說明。

**前端**：UploadPanel 每個文件旁加 dropdown，options 以繁體中文顯示（設計稿、資料規格、品牌指南、參考截圖）。PATCH `/api/projects/:id/upload/:fileId/label` 已存在，可複用並擴充。

### D2: Temperature 設定存在 projects 資料表，預設 0.3

**選擇**：`projects` 加 `generation_temperature REAL DEFAULT 0.3`。ChatPanel 頂部加 slider（0.0–1.0，step 0.1），只在進階設定展開時顯示，避免干擾主流程。

**為何不用全域設定**：不同專案（brainstorm vs. brand-constrained）需要不同 temperature，project-level 更靈活。

### D3: Seed prompt 存在 projects 資料表，生成前 prepend 到 user message

**選擇**：`projects` 加 `seed_prompt TEXT`，chat route 在 `userContent` 最前面加 `[Generation Seed]\n${seed}\n\n`。前端在 ChatPanel 加可折疊的 seed prompt 欄位。

**為何不放 system prompt**：seed prompt 應該像用戶指令而非系統規則，user role 的位置更適合。

### D4: 色彩差異警示用純 JS 提取主色，不呼叫 AI

**選擇**：生成 HTML 後，在前端用 regex 掃描 CSS color 值（`#xxx`, `rgb()`）取頻率最高的 top-3 色，對比 `visual_analysis` 中提取的主色（已儲存在 DB）做 ΔE 計算（簡化為 RGB 距離）。若差距 > 閾值，顯示 badge 警示。

**為何不用 AI 比對**：速度快、無額外費用，主色提取準確度已足夠。

### D5: 拖放層用 pointer events 攔截，postMessage 與 iframe 通信

**選擇**：在 PreviewPanel 的 iframe 上方疊一個透明 `drag-overlay` div（pointer-events: none 平時）。進入「拖放模式」時 overlay 切為 pointer-events: all，攔截 mousedown/mousemove/mouseup 事件，透過 `iframe.contentDocument` 操作目標元素 style（left/top 偏移）。完成後從 `iframe.contentDocument.documentElement.outerHTML` 讀取修改後的 HTML，更新 parent state。

**為何不用 postMessage**：iframe 的 sandbox 已允許 `allow-same-origin`，可直接操作 contentDocument DOM，比 postMessage 往返更簡單。

**限制**：只支援 `data-bridge-id` 元素；拖放後元素變為 `position: relative`（不改 parent 的 display 模式）。

## Risks / Trade-offs

- [Risk] 拖放後 HTML 變更不可逆（無 undo） → Mitigation: 進入拖放模式前提示「可重新生成恢復」，並在拖放確認時才寫入 state（可 cancel）
- [Risk] Seed prompt 與 design spec 內容衝突（seed 說藍色，spec 說紫色） → Mitigation: Seed prompt 位置在 user message，優先級低於 system prompt 中的 DESIGN SPEC 區塊，spec 優先
- [Risk] iframe contentDocument 在某些 sanitize 場景下無法存取 → Mitigation: 已有 allow-same-origin sandbox，現有 annotation 功能已成功存取 DOM，方案可行
- [Risk] Temperature 0.3 太低讓某些創意型生成變差 → Mitigation: Slider 可調，用戶可自行調高；文件明確標注「創意型生成建議 0.7+」

## Migration Plan

1. DB migration：`ALTER TABLE uploaded_files ADD COLUMN intent TEXT`；`ALTER TABLE projects ADD COLUMN generation_temperature REAL DEFAULT 0.3`；`ALTER TABLE projects ADD COLUMN seed_prompt TEXT`
2. 後端 API 無 breaking change：`/chat` route 新增可選參數 `temperature`, `seedPrompt`；`/upload/:fileId/label` 現有 endpoint 已支援 label，intent 用同一 PATCH endpoint 的 `intent` 欄位或擴充現有 `label` 語意（建議新增獨立欄位）
3. 前端改動完全向後相容：新 UI 控件都有預設值

## Open Questions

- 拖放是否需要鎖定到 grid（snap-to-grid）以維持對齊？MVP 先跳過，自由拖移即可。
- Seed prompt 是否要支援 per-generation 覆蓋（單次生成用不同 seed）？MVP 先只做 project-level。
