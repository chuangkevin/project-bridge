## ADDED Requirements

### Requirement: Skill 資料模型

系統 SHALL 提供 skills 資料表儲存領域知識文件，包含以下欄位：id、name、triggers（JSON 關鍵字陣列）、content（Markdown 格式）、scope（global 或 project）、project_id、created_by、created_at。

#### Scenario: 建立全域 Skill

- **WHEN** 管理員建立一個 scope 為 "global" 的 skill
- **THEN** 該 skill SHALL 儲存至資料庫且 project_id 為 null
- **THEN** 該 skill SHALL 在所有專案中可用

#### Scenario: 建立專案 Skill

- **WHEN** 管理員建立一個 scope 為 "project" 的 skill 並指定 project_id
- **THEN** 該 skill SHALL 僅在指定專案中可用

### Requirement: Skill 管理頁面

系統 SHALL 提供 /skills 路由頁面，供管理員進行 skill 的 CRUD 操作。

#### Scenario: 管理員存取 Skill 管理頁面

- **WHEN** 具有 admin 權限的使用者存取 /skills
- **THEN** 系統 SHALL 顯示所有 skills 的清單，包含名稱、觸發關鍵字、scope 與建立時間

#### Scenario: 非管理員無法存取

- **WHEN** 非 admin 使用者嘗試存取 /skills
- **THEN** 系統 SHALL 拒絕存取並顯示權限不足訊息

#### Scenario: 建立新 Skill

- **WHEN** 管理員在 /skills 頁面填寫名稱、觸發關鍵字、內容、scope 後提交
- **THEN** 系統 SHALL 建立新的 skill 記錄
- **THEN** 清單 SHALL 立即更新顯示新 skill

#### Scenario: 編輯 Skill

- **WHEN** 管理員點擊 skill 的編輯按鈕並修改欄位後儲存
- **THEN** 系統 SHALL 更新該 skill 的記錄

#### Scenario: 刪除 Skill

- **WHEN** 管理員點擊 skill 的刪除按鈕並確認
- **THEN** 系統 SHALL 從資料庫移除該 skill

### Requirement: Skill CRUD API

系統 SHALL 提供 /api/skills 路由支援 skill 的 CRUD 操作，僅限 admin 權限。

#### Scenario: 取得 Skill 清單

- **WHEN** 發送 GET /api/skills 請求
- **THEN** 系統 SHALL 回傳所有 skills 的清單

#### Scenario: 依專案過濾 Skill

- **WHEN** 發送 GET /api/skills?project_id=xxx 請求
- **THEN** 系統 SHALL 回傳 scope 為 "global" 以及 project_id 匹配的 skills

#### Scenario: 建立 Skill

- **WHEN** admin 發送 POST /api/skills 包含有效的 skill 資料
- **THEN** 系統 SHALL 建立 skill 並回傳 201 狀態碼與建立的記錄

#### Scenario: 非 admin 建立 Skill 被拒

- **WHEN** 非 admin 使用者發送 POST /api/skills
- **THEN** 系統 SHALL 回傳 403 狀態碼

#### Scenario: 更新 Skill

- **WHEN** admin 發送 PUT /api/skills/:id 包含更新資料
- **THEN** 系統 SHALL 更新 skill 並回傳更新後的記錄

#### Scenario: 刪除 Skill

- **WHEN** admin 發送 DELETE /api/skills/:id
- **THEN** 系統 SHALL 刪除 skill 並回傳 200 狀態碼

### Requirement: AI Agent Skill 觸發機制

系統 SHALL 在 AI 生成流程中，使用 AI Agent 分析使用者輸入並決定注入哪些 skills 至系統提示詞。關鍵字匹配的 skills 獲得優先權。

#### Scenario: 關鍵字匹配的 Skill 被優先選擇

- **WHEN** 使用者輸入包含某 skill 的觸發關鍵字
- **THEN** 該 skill SHALL 被標記為關鍵字命中
- **THEN** AI Agent 在選擇 skills 時 SHALL 優先考慮關鍵字命中的 skills

#### Scenario: AI Agent 選擇語意相關的 Skill

- **WHEN** 使用者輸入未直接匹配任何關鍵字，但語意與某 skill 相關
- **THEN** AI Agent SHALL 可以選擇該語意相關的 skill 進行注入

#### Scenario: 注入上限為 3 個 Skills

- **WHEN** AI Agent 判斷有超過 3 個相關 skills
- **THEN** 系統 SHALL 僅注入最相關的 3 個 skills
- **THEN** 關鍵字命中的 skills SHALL 優先於僅語意相關的 skills

#### Scenario: Skill 內容注入系統提示詞

- **WHEN** AI Agent 選定注入的 skills
- **THEN** 系統 SHALL 將 skills 的 content 附加至 AI 生成的系統提示詞中
- **THEN** 注入的內容 SHALL 以明確的分隔標記區隔

#### Scenario: 無相關 Skill 時正常生成

- **WHEN** AI Agent 判斷無相關 skills
- **THEN** 系統 SHALL 不注入任何 skill 內容，正常進行生成
