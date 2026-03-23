## ADDED Requirements

### Requirement: Figma 匯出端點
系統 SHALL 提供 `POST /api/projects/:id/export-figma` REST 端點，將指定專案的 HTML 原型解析為 Figma Plugin API 相容的中間 JSON 格式並回傳。

#### Scenario: 成功匯出專案為 Figma JSON
- **WHEN** 使用者對一個有效專案發送 `POST /api/projects/:id/export-figma` 請求
- **THEN** 伺服器 SHALL 回傳 HTTP 200 並包含 Figma 相容的 JSON 結構
- **THEN** 回應的 `Content-Type` SHALL 為 `application/json`

#### Scenario: 匯出不存在的專案
- **WHEN** 使用者對一個不存在的專案 ID 發送匯出請求
- **THEN** 伺服器 SHALL 回傳 HTTP 404 並包含錯誤訊息

#### Scenario: 匯出沒有原型內容的專案
- **WHEN** 使用者對一個尚未生成原型的專案發送匯出請求
- **THEN** 伺服器 SHALL 回傳 HTTP 400 並包含錯誤訊息，說明該專案無可匯出的原型內容

### Requirement: HTML 解析為結構化節點樹
系統 SHALL 將 HTML 原型內容解析為結構化的節點樹，包含頁面（Page）、框架（Frame）、文字（Text）、矩形（Rectangle）等節點類型，以及對應的樣式資訊。

#### Scenario: 解析包含多個區塊的 HTML
- **WHEN** 原型 HTML 包含多個 `<div>` 區塊元素
- **THEN** 系統 SHALL 將每個區塊解析為 Frame 或 Rectangle 節點
- **THEN** 每個節點 SHALL 包含位置（x, y）、尺寸（width, height）資訊

#### Scenario: 解析文字元素
- **WHEN** 原型 HTML 包含文字內容（`<p>`, `<h1>` ~ `<h6>`, `<span>` 等）
- **THEN** 系統 SHALL 將其解析為 Text 節點
- **THEN** Text 節點 SHALL 包含文字內容、字型大小、字型粗細、色彩等樣式資訊

#### Scenario: 解析 CSS 樣式
- **WHEN** HTML 元素帶有內聯樣式或 CSS 類別定義的樣式
- **THEN** 系統 SHALL 提取背景色、邊框、圓角、陰影等視覺屬性
- **THEN** 樣式資訊 SHALL 轉換為 Figma 節點的對應屬性格式

### Requirement: Figma Plugin API 相容 JSON 格式
匯出的 JSON SHALL 遵循 Figma Plugin API 的節點結構，包含 `document` 根節點，其下為 `page` 節點，`page` 下為 `frame` 及子節點。每個節點 SHALL 包含 `type`、`name`、`children`（若適用）以及樣式屬性。

#### Scenario: JSON 結構包含完整節點階層
- **WHEN** 系統完成 HTML 解析
- **THEN** 輸出的 JSON SHALL 包含 `document` 根節點
- **THEN** `document` 下 SHALL 包含至少一個 `page` 節點
- **THEN** `page` 下 SHALL 包含對應原型內容的 `frame` 節點

#### Scenario: 節點包含必要的型別與屬性
- **WHEN** JSON 中有一個節點
- **THEN** 該節點 SHALL 包含 `type` 欄位（值為 `DOCUMENT`、`PAGE`、`FRAME`、`RECTANGLE`、`TEXT` 之一）
- **THEN** 該節點 SHALL 包含 `name` 欄位
- **THEN** 若為容器型節點 SHALL 包含 `children` 陣列

#### Scenario: 樣式屬性使用 Figma 格式
- **WHEN** 節點具有視覺樣式
- **THEN** 填充色 SHALL 使用 `fills` 陣列格式（`[{ type: 'SOLID', color: { r, g, b }, opacity }]`）
- **THEN** 色彩值 SHALL 為 0-1 範圍的浮點數（Figma 格式），而非 0-255
- **THEN** 圓角 SHALL 使用 `cornerRadius` 數值屬性

### Requirement: 匯出不包含 Figma Plugin 實作
Figma Plugin 的實作（讀取 JSON 並在 Figma 中建立節點）為獨立專案，不在本次變更範圍內。本系統僅負責產出中間 JSON 格式。

#### Scenario: 匯出端點僅回傳 JSON 資料
- **WHEN** 使用者呼叫匯出端點
- **THEN** 系統 SHALL 僅回傳 JSON 資料
- **THEN** 系統 SHALL NOT 嘗試與 Figma API 通訊或建立 Figma 檔案
