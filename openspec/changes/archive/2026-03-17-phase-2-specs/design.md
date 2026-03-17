## Context

Phase 1 已完成：monorepo 架構（React + Express + SQLite）、對話生成、iframe 預覽、分享。Phase 2 在此基礎上新增檔案上傳解析、註解系統、規格面板。

## Goals / Non-Goals

**Goals:**
- PM 可上傳 PDF/Word/PPT/圖片，系統提取文字後作為 AI 輸入
- PM 可在原型元件上新增註解（文字備註）
- PM 可在規格面板中為元件填入結構化規格
- 對話可附加結構化約束（裝置/色系）影響生成結果

**Non-Goals:**
- Gitea 整合（Phase 3）
- 直接編輯器（Phase 4）
- 行為模擬（Phase 4）

## Decisions

### 1. 檔案上傳處理

**決定**: 檔案上傳至後端，存入 `data/uploads/` 目錄，用 multer 處理。後端解析文字後存入 `uploaded_files` 表的 `extracted_text` 欄位。提取的文字會自動附加到下一次對話的 prompt 中。

**理由**: 簡單直接，不需要額外的檔案服務。
**替代方案**: 前端直接讀取解析 — 瀏覽器端 OCR 體驗差且慢。

### 2. 文字提取策略

| 格式 | 工具 | 備註 |
|------|------|------|
| PDF | pdf-parse | 純文字提取，不含佈局 |
| Word (.docx) | mammoth | 文字 + 基本結構（標題、列表） |
| PPT (.pptx) | pptx-parser | 每頁文字提取 |
| 圖片 | Tesseract.js | 在 worker thread 執行，避免阻塞。適合掃描文件，圖表效果有限 |

**決定**: Tesseract.js 用 `worker_threads` 執行，避免阻塞 event loop。

### 3. 註解綁定機制

**決定**: 透過 iframe postMessage 雙向通訊。

流程：
1. 主頁面注入一段 bridge script 到 iframe 的 HTML 中（在 `</body>` 前插入）
2. Bridge script 監聽 click 事件，找到最近的有 `data-bridge-id` 的元素
3. 透過 `postMessage` 將 `bridgeId` 和元素位置回傳給主頁面
4. 主頁面打開註解編輯器，存入 DB
5. 主頁面透過 `postMessage` 通知 iframe 顯示註解標記

**理由**: 不破壞 sandbox 隔離，postMessage 是標準的跨 origin 通訊方式。
**iframe sandbox**: 改為 `sandbox="allow-scripts allow-same-origin"` 以支援 postMessage。

### 4. 規格面板

**決定**: 右側面板，點擊元件後顯示。結構化欄位包含：
- 欄位名稱、類型、限制（min/max/pattern）
- API endpoint（method + path）
- 驗證規則（文字描述）
- 業務邏輯備註

以 JSON 存入 annotations 表的 `spec_data` 欄位。

### 5. 結構化約束

**決定**: 對話面板上方新增約束列（可展開收合）：
- 裝置類型：desktop / tablet / mobile
- 色系：light / dark / custom（hex input）
- 語言：zh-TW / en / ja

約束注入到 system prompt 的末尾作為額外指示。

## Risks / Trade-offs

- **OCR 品質不穩定** → 上傳後顯示提取結果讓 PM 確認/編輯再送出
- **data-bridge-id 在重新生成後可能消失** → system prompt 已要求保留，但仍可能丟失。註解存有 label + position fallback。
- **大檔案上傳慢** → 限制 20MB/檔案，100MB/專案。上傳時顯示進度條。
