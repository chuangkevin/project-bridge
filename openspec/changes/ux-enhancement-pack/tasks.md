## 1. 修復標註模式 (Bug Fix)

- [x] 1.1 修改 bridgeScript.ts click handler — annotation/apiBinding 模式優先判斷，visual-edit 最後處理
- [ ] 1.2 驗證標註模式可正確選取元素並開啟編輯器
- [ ] 1.3 驗證 API 綁定模式也能正確觸發 element-click

## 1b. 修復架構圖右鍵選單 (Bug Fix)

- [x] 1b.1 ArchPageNode.tsx onContextMenu 加入 stopPropagation 防止事件冒泡
- [x] 1b.2 ArchFlowchart.tsx 加入 onPaneContextMenu 防止畫布右鍵觸發瀏覽器選單

## 1c. 刪除專案確認 (GitHub-style)

- [x] 1c.1 HomePage 刪除改為 modal 對話框，需輸入完整專案名稱才能刪除
- [ ] 1c.2 驗證刪除確認流程（名稱不符時按鈕 disabled、Enter 快捷鍵）

## 2. 專案建立模式選擇

- [x] 2.1 修改 NewProjectDialog — 加入模式選擇 UI（架構設計 / 設計）
- [x] 2.2 POST /api/projects 支援 mode 參數
- [x] 2.3 WorkspacePage 根據 project mode 決定初始 tab（架構圖 or 聊天面板）

## 3. 頁面層級 API Binding

- [x] 3.1 新增 DB migration：api_bindings 表加入 page_name 欄位（nullable）
- [x] 3.2 修改 apiBindings route — 支援 page_name 建立/查詢/刪除
- [x] 3.3 修改 ApiBindingPanel — 加入「頁面層級 API」區塊，不需點選元素即可新增
- [x] 3.4 修改匯出邏輯 — page-level bindings 正確包含在匯出結果

## 4. 拖曳排序專案

- [x] 4.1 安裝 @dnd-kit/core + @dnd-kit/sortable
- [x] 4.2 新增 DB migration：user_preferences 表（user_id, key, value JSON）
- [x] 4.3 新增 API：GET/PUT /api/users/preferences（讀寫偏好）
- [x] 4.4 修改 HomePage — 專案卡片用 SortableContext 包裹，支援拖曳
- [x] 4.5 拖曳結束時呼叫 API 持久化排序結果
- [x] 4.6 新專案建立時自動插入排序列表最上方

## 5. 深色模式

- [ ] 5.1 建立 CSS 變數主題檔案（light.css / dark.css 或單檔 :root + [data-theme="dark"]）
- [ ] 5.2 新增主題切換元件（SettingsPage 或全域 header）
- [ ] 5.3 主題偏好存入 user_preferences + localStorage fallback
- [ ] 5.4 系統偏好偵測（prefers-color-scheme: dark）
- [ ] 5.5 首頁、工作區、設定頁框架級樣式套用 CSS 變數
- [ ] 5.6 對話框、面板、卡片等共用元件套用 CSS 變數

## 6. 測試

- [ ] 6.1 E2E 測試：標註模式元素選取
- [ ] 6.2 E2E 測試：新增專案模式選擇
- [ ] 6.3 API 測試：頁面層級 API binding CRUD
- [ ] 6.4 E2E 測試：深色模式切換
- [ ] 6.5 E2E 測試：刪除專案確認對話框
