## Why

Project Bridge 的核心互動體驗有多處需要改善：新增專案缺乏引導、標註模式因 visual-edit-mode 引入後無法點選元素、API 標註只支援元素層級而非頁面層級、首頁專案無法手動排序、且缺乏深色模式讓長時間使用者眼睛疲勞。這些問題直接影響日常使用效率。

## What Changes

- 新增專案時提供模式選擇對話框（架構設計模式 / 設計模式），引導使用者從不同起點開始
- 修復標註模式（annotation mode）無法點選元素的 bug — visual-edit-mode 攔截了點擊事件
- 修復架構圖頁面右鍵選單被瀏覽器預設選單覆蓋的問題
- 刪除專案改為 GitHub 式確認（需輸入完整專案名稱），防止誤刪
- API 標註擴展為支援頁面層級綁定，列表頁可直接標註整頁的資料 API
- 首頁專案卡片支援拖曳排序，排序結果持久化
- 全站深色模式支援，使用者可切換明/暗主題

## Capabilities

### New Capabilities
- `project-creation-wizard`: 新增專案時的模式選擇流程（架構設計 vs 設計模式），根據選擇引導不同的初始工作區狀態
- `page-level-api-binding`: API 標註擴展至頁面層級，列表頁等場景可標註整頁的資料來源 API
- `project-drag-sort`: 首頁專案卡片拖曳排序，排序持久化至使用者偏好
- `dark-mode`: 全站深色模式切換，CSS 變數驅動的主題系統

### Modified Capabilities
- `annotation-system`: 修復標註模式點擊事件被 visual-edit-mode 攔截的 bug

## Impact

- **前端**: NewProjectDialog、HomePage、WorkspacePage、SettingsPage、bridgeScript.ts、所有元件的 CSS
- **後端**: projects route（排序欄位）、apiBindings route（頁面層級綁定）
- **DB**: 可能新增 user_preferences 表（排序、主題偏好）、api_bindings 表擴展 page 欄位
- **bridgeScript**: 修復互動模式的事件處理優先級
