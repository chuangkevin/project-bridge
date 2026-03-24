## Why

Project Bridge 生成的 prototype 目前只能在瀏覽器中預覽，無法直接匯入設計工具。設計師需要在 Figma 中進行後續的精修、標注和交付，缺少從 prototype 到 Figma 的橋樑。html.to.design 和 code.to.design 提供了成熟的 HTML → Figma 轉換方案，可以低成本整合。

## What Changes

- 工作區新增「匯出到 Figma」按鈕
- 支援兩種匯出路徑：
  1. **快速匯出**：複製 prototype 公開分享 URL，引導使用者到 html.to.design Figma 插件貼上 URL 匯入
  2. **API 匯出**（進階）：透過 code.to.design API 將 HTML 轉換為 Figma 剪貼簿資料，使用者可直接在 Figma 中 Ctrl+V 貼上
- 設定頁新增 code.to.design API key 管理（可選）

## Capabilities

### New Capabilities
- `figma-quick-export`: 快速匯出流程 — 確保 prototype 有公開分享連結，複製 URL + 顯示操作指引（安裝插件 → 貼上 URL → 匯入）
- `figma-api-export`: API 匯出流程 — 呼叫 code.to.design API 將 HTML 轉為 Figma 剪貼簿資料，支援多頁面、viewport 選擇

### Modified Capabilities

## Impact

- **Client**: `WorkspacePage.tsx` — 新增匯出按鈕和匯出對話框
- **Server**: 新增 `/api/projects/:id/export/figma` 端點（呼叫 code.to.design API）
- **Server**: `settings.ts` — 新增 code.to.design API key 設定
- **Dependencies**: code.to.design API（外部付費服務，可選）
- **現有功能**: 需確保每個 prototype 都有可公開存取的分享 URL
