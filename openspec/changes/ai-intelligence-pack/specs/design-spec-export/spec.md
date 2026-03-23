## ADDED Requirements

### Requirement: 設計規格文件資料收集

系統 SHALL 從原型及其相關資料收集完整的設計規格資訊，包含：頁面清單（page inventory）、元素規格（element specs）、API 合約（API contracts）、驗證規則（validation rules）、設計 token（design tokens）、標註與約束。

#### Scenario: 收集單一專案的完整規格資料

- **WHEN** 使用者請求產生設計規格文件並指定專案
- **THEN** 系統 SHALL 收集該專案所有頁面的生成內容、標註、約束、API 綁定
- **THEN** 收集的資料 SHALL 傳送給 Gemini API 進行組織整理

#### Scenario: 專案無頁面時拒絕匯出

- **WHEN** 指定專案沒有任何生成的頁面
- **THEN** 系統 SHALL 回傳錯誤訊息表示無可匯出內容

### Requirement: Gemini 組織 PRD 文件

系統 SHALL 使用 Gemini API 將收集的資料組織成結構化的 PRD（Product Requirements Document）文件。

#### Scenario: 成功產生 PRD

- **WHEN** 系統將收集的資料傳送給 Gemini API
- **THEN** Gemini SHALL 回傳包含以下章節的結構化文件：
  - 專案概覽
  - 頁面清單與導覽結構
  - 各頁面元素規格
  - API 合約（endpoint、method、request/response schema）
  - 驗證規則
  - 設計 token（色彩、字型、間距等）

#### Scenario: 生成過程中顯示進度

- **WHEN** PRD 文件生成進行中
- **THEN** 系統 SHALL 顯示載入狀態指示器

### Requirement: Markdown 匯出

系統 SHALL 支援將 PRD 文件以 Markdown 格式匯出下載。

#### Scenario: 匯出 Markdown 檔案

- **WHEN** 使用者點擊「匯出 Markdown」按鈕
- **THEN** 系統 SHALL 產生 `.md` 檔案並觸發瀏覽器下載
- **THEN** 檔案名稱 SHALL 包含專案名稱與日期

### Requirement: PDF 匯出

系統 SHALL 支援將 PRD 文件以 PDF 格式匯出下載。

#### Scenario: 匯出 PDF 檔案

- **WHEN** 使用者點擊「匯出 PDF」按鈕
- **THEN** 系統 SHALL 將 Markdown 轉換為 HTML 再轉換為 PDF
- **THEN** PDF SHALL 包含基本排版（標題、段落、程式碼區塊）
- **THEN** 檔案 SHALL 觸發瀏覽器下載

#### Scenario: PDF 匯出失敗時回退

- **WHEN** PDF 轉換過程失敗
- **THEN** 系統 SHALL 顯示錯誤訊息並建議使用者改用 Markdown 匯出

### Requirement: 設計規格匯出 API

系統 SHALL 提供 /api/design-spec 路由處理匯出請求。

#### Scenario: 產生設計規格

- **WHEN** 發送 POST /api/design-spec/generate 包含 project_id
- **THEN** 系統 SHALL 回傳產生的 PRD 文件（Markdown 格式）

#### Scenario: 匯出 PDF

- **WHEN** 發送 POST /api/design-spec/export-pdf 包含 project_id
- **THEN** 系統 SHALL 回傳 PDF 檔案（Content-Type: application/pdf）

#### Scenario: 無效專案 ID

- **WHEN** 發送請求包含不存在的 project_id
- **THEN** 系統 SHALL 回傳 404 狀態碼
