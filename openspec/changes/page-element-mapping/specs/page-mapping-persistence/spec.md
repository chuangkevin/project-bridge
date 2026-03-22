## ADDED Requirements

### Requirement: page_element_mappings 資料表
系統 SHALL 建立 `page_element_mappings` 資料表儲存元素導航對應關係。

#### Scenario: 資料表結構
- **WHEN** migration 執行
- **THEN** 建立表包含欄位：id (TEXT PK), project_id (TEXT), bridge_id (TEXT), page_name (TEXT), navigation_target (TEXT nullable), arch_component_id (TEXT nullable), created_at, updated_at，且 (project_id, bridge_id) 為 UNIQUE

### Requirement: GET /api/projects/:id/page-mappings
系統 SHALL 提供 API 取得專案的所有 page mapping。

#### Scenario: 取得 mapping 列表
- **WHEN** 前端發送 GET /api/projects/:id/page-mappings
- **THEN** 回傳該專案所有 mapping 記錄，包含 bridge_id, page_name, navigation_target, arch_component_id

#### Scenario: 專案無 mapping
- **WHEN** 專案沒有任何 mapping
- **THEN** 回傳空陣列 `[]`

### Requirement: PUT /api/projects/:id/page-mappings
系統 SHALL 提供 API 新增或更新單筆 page mapping。

#### Scenario: 新增 mapping
- **WHEN** 前端發送 PUT 帶有 `{ bridgeId, pageName, navigationTarget, archComponentId? }`
- **THEN** 系統 SHALL 建立新的 mapping 記錄（或更新既有的），回傳更新後的 mapping

#### Scenario: 更新 HTML onclick
- **WHEN** mapping 儲存成功且 navigationTarget 不為空
- **THEN** 系統 SHALL 在當前原型 HTML 中找到對應 bridge_id 的元素，設定或更新 `onclick="showPage('目標頁')"`

#### Scenario: 移除導航
- **WHEN** 前端發送 PUT 帶有 `{ bridgeId, pageName, navigationTarget: null }`
- **THEN** 系統 SHALL 移除該 mapping 記錄，並從 HTML 中移除對應的 onclick showPage

### Requirement: 重新生成後 mapping 清理
系統 SHALL 在生成新原型後，自動清理失效的 mapping。

#### Scenario: bridge_id 仍存在
- **WHEN** 新原型 HTML 中仍包含某個 bridge_id
- **THEN** 對應的 mapping SHALL 保留，且 onclick SHALL 重新套用到新 HTML

#### Scenario: bridge_id 不存在
- **WHEN** 新原型 HTML 中不包含某個 bridge_id
- **THEN** 對應的 mapping SHALL 被刪除，關聯的 ArchEdge（triggerBridgeId 匹配）也 SHALL 被移除

#### Scenario: 全新生成（無舊 mapping）
- **WHEN** 專案首次生成原型
- **THEN** 不執行任何清理操作
