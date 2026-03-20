## Why

UI 上面向使用者的按鈕和標籤仍使用英文（Architecture、Annotation、Export、History 等），對非技術背景的 PM/設計師不友善。需要將這些改為繁體中文。API 相關的技術名詞（如 API key、token）保持英文不動。

## What Changes

將所有面向使用者的非技術類 UI 文字改為繁體中文：

**需要中文化的**：
- Architecture → 架構圖
- Annotation / Annotate → 標注
- Export → 匯出
- History → 歷史版本
- Desktop / Tablet / Mobile → 桌面版 / 平板 / 手機版
- Settings → 設定
- New Project → 新增專案
- Design → 設計
- Chat → 對話
- Constraints → 限制條件
- Attach file → 附加檔案
- Describe your UI... → 描述你的 UI...
- Collapse panel → 收合面板
- Spec → 規格
- Save / Cancel / Confirm / Delete → 儲存 / 取消 / 確認 / 刪除

**保持英文的**：
- API key、Token、Gemini 等技術名詞
- data-bridge-id 等程式碼相關屬性
- CSS variables、Design Tokens 等開發者面向名詞

## Capabilities

### New Capabilities
- `ui-zhtw-labels`: 將所有使用者面向的英文按鈕、標籤、placeholder 改為繁體中文

### Modified Capabilities
*None — 純文字替換，不改變行為*

## Impact

- **Client**: WorkspacePage.tsx, ChatPanel.tsx, SettingsPage.tsx, TokenPanel.tsx, ArchFlowchart.tsx, PreviewPanel.tsx 等所有前端元件的文字替換
- **Server**: 無影響
- **Risk**: 低 — 純 UI 文字變更
