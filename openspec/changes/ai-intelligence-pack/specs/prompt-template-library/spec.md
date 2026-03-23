## ADDED Requirements

### Requirement: 提示詞模板資料模型

系統 SHALL 提供 prompt_templates 資料表，包含以下欄位：id、name、category、content（支援 `{{variable}}` 佔位符）、is_system（系統預設或自訂）、created_by、created_at。

#### Scenario: 系統預設模板初始化

- **WHEN** 系統首次啟動或資料庫初始化
- **THEN** 系統 SHALL 建立預設模板，至少包含：表單（form）、儀表板（dashboard）、著陸頁（landing）、列表頁（list）、詳情頁（detail）
- **THEN** 預設模板的 is_system SHALL 為 true

#### Scenario: 系統模板不可被刪除

- **WHEN** 嘗試刪除 is_system 為 true 的模板
- **THEN** 系統 SHALL 拒絕操作並回傳錯誤

### Requirement: 模板管理 API

系統 SHALL 提供 /api/prompt-templates 路由支援模板的 CRUD 操作。一般使用者可讀取，僅 admin 可建立、修改、刪除自訂模板。

#### Scenario: 取得模板清單

- **WHEN** 發送 GET /api/prompt-templates
- **THEN** 系統 SHALL 回傳所有模板，依 category 分組

#### Scenario: 依分類過濾模板

- **WHEN** 發送 GET /api/prompt-templates?category=form
- **THEN** 系統 SHALL 僅回傳 category 為 "form" 的模板

#### Scenario: Admin 建立自訂模板

- **WHEN** admin 發送 POST /api/prompt-templates 包含有效資料
- **THEN** 系統 SHALL 建立模板，is_system 設為 false
- **THEN** 系統 SHALL 回傳 201 狀態碼

#### Scenario: 非 admin 建立模板被拒

- **WHEN** 非 admin 使用者發送 POST /api/prompt-templates
- **THEN** 系統 SHALL 回傳 403 狀態碼

#### Scenario: Admin 更新自訂模板

- **WHEN** admin 發送 PUT /api/prompt-templates/:id 更新非系統模板
- **THEN** 系統 SHALL 更新模板並回傳更新後的記錄

#### Scenario: Admin 刪除自訂模板

- **WHEN** admin 發送 DELETE /api/prompt-templates/:id 刪除非系統模板
- **THEN** 系統 SHALL 刪除模板並回傳 200 狀態碼

### Requirement: 對話介面模板選擇器

系統 SHALL 在 ChatInput 元件旁顯示模板選擇器，使用者可瀏覽並選擇模板自動填入提示詞。

#### Scenario: 顯示模板選擇器

- **WHEN** 使用者在對話介面準備輸入提示詞
- **THEN** ChatInput 旁 SHALL 顯示模板選擇器按鈕（如書本圖示）

#### Scenario: 瀏覽模板分類

- **WHEN** 使用者點擊模板選擇器按鈕
- **THEN** 系統 SHALL 顯示模板清單，依分類（form、dashboard、landing、list、detail、other）分組

#### Scenario: 選擇模板自動填入

- **WHEN** 使用者從清單中選擇一個模板
- **THEN** 模板內容 SHALL 自動填入 ChatInput 輸入框
- **THEN** 若模板包含 `{{variable}}` 佔位符，SHALL 以高亮方式標記提醒使用者替換

#### Scenario: 模板不覆蓋已有輸入

- **WHEN** ChatInput 已有使用者輸入的文字，且使用者選擇模板
- **THEN** 系統 SHALL 將模板內容附加至現有文字之後，而非覆蓋
