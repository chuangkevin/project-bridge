## ADDED Requirements

### Requirement: 頁面對應模式入口
系統 SHALL 在 WorkspacePage toolbar 提供「頁面對應」按鈕，點擊後進入頁面對應模式。此模式與對話、設計、樣式模式並列。

#### Scenario: 進入頁面對應模式
- **WHEN** 使用者點擊 toolbar 的「頁面對應」按鈕
- **THEN** 左側面板顯示頁面總覽，中間顯示 iframe 原型預覽，右側顯示 mapping 設定面板

#### Scenario: 無原型時禁用
- **WHEN** 專案尚未生成原型（無 HTML）
- **THEN** 「頁面對應」按鈕 SHALL 為 disabled 狀態，hover 顯示提示「請先生成原型」

### Requirement: 左側頁面總覽
系統 SHALL 在頁面對應模式的左側面板顯示所有頁面列表，頁面從 prototype HTML 的 `data-page` 屬性解析。

#### Scenario: 顯示頁面列表
- **WHEN** 使用者進入頁面對應模式
- **THEN** 左側面板列出所有 `data-page` 頁面名稱，每個頁面旁顯示已設定的導航 mapping 數量（如 `首頁 (3)`）

#### Scenario: 點擊切換預覽頁面
- **WHEN** 使用者點擊左側的某個頁面名稱
- **THEN** 中間 iframe 切換到該頁面（呼叫 `showPage()`），且該頁面在列表中標記為 active

#### Scenario: 單頁原型
- **WHEN** 原型只有一個 data-page
- **THEN** 左側仍顯示該頁面，無需切換功能

### Requirement: 元素點選與高亮
系統 SHALL 在頁面對應模式下，允許使用者點選 iframe 中的元素進行 mapping 設定。

#### Scenario: 點選元素
- **WHEN** 使用者在 iframe 中點選一個帶有 `data-bridge-id` 的元素
- **THEN** 該元素 SHALL 顯示高亮邊框，右側面板顯示該元素的 mapping 設定

#### Scenario: 元素資訊顯示
- **WHEN** 元素被選中
- **THEN** 右側面板顯示：元素標籤（HTML tag）、元素文字內容、所屬頁面（data-page）

#### Scenario: 切換選取
- **WHEN** 使用者點選另一個元素
- **THEN** 舊元素取消高亮，新元素高亮，右側面板更新為新元素的資訊

### Requirement: 導航目標設定
系統 SHALL 允許使用者為選中的元素設定導航目標頁面。

#### Scenario: 設定導航目標
- **WHEN** 使用者在右側面板的「點擊導航到」dropdown 選擇一個頁面
- **THEN** dropdown 顯示所有 data-page 頁面（排除當前所屬頁面）

#### Scenario: 清除導航目標
- **WHEN** 使用者在 dropdown 選擇「無」或清空選擇
- **THEN** 該元素的導航 mapping SHALL 被移除

#### Scenario: 儲存 mapping
- **WHEN** 使用者點擊「儲存」按鈕
- **THEN** 系統呼叫後端 API 儲存 mapping，更新 HTML onclick，並更新左側頁面總覽的 mapping 數量

### Requirement: 元件身份設定
系統 SHALL 允許使用者為選中的元素標記對應的架構圖元件（可選）。

#### Scenario: 設定元件身份
- **WHEN** 專案有架構圖且當前頁面對應的 ArchNode 有 ArchComponents
- **THEN** 右側面板顯示「元件身份」dropdown，列出該頁 ArchNode 下的所有 ArchComponents

#### Scenario: 無架構圖時隱藏
- **WHEN** 專案沒有架構圖
- **THEN** 「元件身份」dropdown SHALL 隱藏（不影響導航目標設定功能）

### Requirement: Bridge Script page-mapping-mode
bridgeScript SHALL 支援 `page-mapping-mode`，在此模式下元素可點選但不觸發編輯或標記。

#### Scenario: 進入 page-mapping-mode
- **WHEN** 父視窗發送 `{ type: 'set-mode', mode: 'page-mapping' }` 訊息
- **THEN** iframe 內所有帶 `data-bridge-id` 的元素 SHALL 變為可點選，hover 顯示高亮

#### Scenario: 點選回傳元素資訊
- **WHEN** 使用者在 page-mapping-mode 下點選元素
- **THEN** bridge script SHALL 發送 `{ type: 'element-selected', bridgeId, tag, textContent, pageName }` 訊息給父視窗
