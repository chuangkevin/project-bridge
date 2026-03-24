## 1. 快速匯出（免費路線）

- [ ] 1.1 WorkspacePage toolbar 新增「匯出 Figma」按鈕（有 prototype 時才顯示）
- [ ] 1.2 建立 FigmaExportDialog 元件 — 對話框 layout（快速匯出 + API 匯出兩區塊）
- [ ] 1.3 快速匯出區塊：顯示分享 URL + 複製按鈕 + 操作步驟說明
- [ ] 1.4 確保 `/share/:token` 路由可正常存取 prototype（驗證現有分享功能）

## 2. API 匯出（code.to.design）

- [ ] 2.1 Settings 頁新增 code.to.design API Key 輸入欄位 + 儲存
- [ ] 2.2 Server 新增 `POST /api/projects/:id/export/figma` 端點
- [ ] 2.3 端點實作：讀取 prototype HTML → 呼叫 code.to.design API（clip: true）→ 回傳 clipboardData
- [ ] 2.4 支援 viewport 參數（desktop: 1440, tablet: 768, mobile: 390）
- [ ] 2.5 多頁面支援：解析 `<!-- PAGE: name -->` 拆分頁面，呼叫 html-multi endpoint
- [ ] 2.6 錯誤處理：API key 無效、餘額不足、服務不可用

## 3. Client 整合

- [ ] 3.1 FigmaExportDialog API 匯出區塊：viewport 選擇下拉 + 匯出按鈕
- [ ] 3.2 匯出按鈕 click → 呼叫 server endpoint → 寫入剪貼簿 → 顯示成功訊息
- [ ] 3.3 無 API key 時 disable API 匯出區塊 + 顯示「請在設定頁配置 API Key」提示
- [ ] 3.4 匯出中顯示 loading 狀態（spinner + 「轉換中...」）

## 4. 測試

- [ ] 4.1 手動測試：快速匯出流程（複製 URL → html.to.design 插件匯入）
- [ ] 4.2 手動測試：API 匯出流程（需有 code.to.design API key）
- [ ] 4.3 E2E 測試：匯出對話框開啟、複製連結按鈕、viewport 選擇
