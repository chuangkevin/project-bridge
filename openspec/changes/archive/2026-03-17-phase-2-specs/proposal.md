## Why

Phase 1 只支援純文字/Markdown 輸入，PM 無法上傳既有的規格文件（PDF/Word/PPT），也無法在原型上標註規格和限制給工程師看。Phase 2 讓 PM 的工作流更完整：上傳任何格式的規格文件，並在生成的原型上加上結構化的規格資訊。

## What Changes

- 新增多格式檔案上傳功能：PDF、Word、PowerPoint、圖片（OCR）
- 後端文字提取服務：各格式解析為純文字後餵給 AI
- 對話中支援結構化約束（裝置類型、色系、元件偏好）
- 原型上的註解系統：PM 點擊元件新增文字註解
- 規格面板：點擊元件顯示結構化規格（欄位限制、API endpoint、驗證規則）
- 註解和規格資料以 `data-bridge-id` 綁定元件

## Capabilities

### New Capabilities
- `file-upload-parsing`: 多格式檔案上傳（PDF/Word/PPT/Image）與文字提取
- `annotation-system`: 原型上的註解系統，PM 可在元件上新增/編輯/刪除文字註解
- `spec-panel`: 結構化規格面板，點擊元件顯示並編輯欄位限制、API、驗證規則
- `structured-constraints`: 對話中加入結構化約束（裝置/色系/元件偏好），注入 AI prompt

### Modified Capabilities

(None)

## Impact

- **New dependencies**: pdf-parse, mammoth, pptx-parser, tesseract.js
- **APIs**: 新增 file upload endpoint、annotation CRUD endpoints
- **Database**: 新增 uploaded_files、annotations 表
- **Frontend**: 對話面板新增檔案上傳區域、新增右側規格面板、原型 iframe 需支援 postMessage 互動
