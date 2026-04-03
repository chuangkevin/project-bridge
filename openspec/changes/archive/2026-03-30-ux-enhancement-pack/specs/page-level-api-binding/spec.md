## ADDED Requirements

### Requirement: Page-level API binding
系統 SHALL 支援頁面層級的 API 綁定，允許使用者為整個頁面指定資料來源 API，而非僅限於單一元素。

#### Scenario: Create page-level binding for a list page
- **WHEN** 使用者在 API Binding Panel 選擇「頁面層級 API」並填入 GET /api/products
- **THEN** 系統建立一筆 page_name 有值、bridge_id 為空的 api_binding 記錄

#### Scenario: View page-level bindings alongside element bindings
- **WHEN** 使用者開啟 API Binding Panel
- **THEN** 面板 SHALL 分開顯示「頁面層級 API」和「元素層級 API」兩個區塊

#### Scenario: Export includes page-level bindings
- **WHEN** 使用者匯出 API bindings
- **THEN** 匯出結果 SHALL 包含頁面層級綁定，標註為 page-level
