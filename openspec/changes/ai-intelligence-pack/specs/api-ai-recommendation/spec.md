## ADDED Requirements

### Requirement: AI 推薦按鈕顯示於 ApiBindingPanel

系統 SHALL 在 ApiBindingPanel 中顯示「AI 推薦」按鈕，允許使用者觸發 AI 分析頁面上下文以建議 API schema。

#### Scenario: 使用者看到 AI 推薦按鈕

- **WHEN** 使用者開啟 ApiBindingPanel 建立或編輯 API 綁定
- **THEN** 面板中 SHALL 顯示「AI 推薦」按鈕

#### Scenario: 按鈕在無頁面內容時停用

- **WHEN** 當前頁面尚未有任何生成的 HTML 內容
- **THEN** 「AI 推薦」按鈕 SHALL 呈現停用狀態並顯示提示訊息

### Requirement: AI 分析頁面上下文產生 schema 建議

系統 SHALL 收集當前頁面 HTML、選中元素資訊、現有標註與約束，傳送給 Gemini API 進行分析，回傳建議的 request 與 response body JSON schema。

#### Scenario: 成功產生 API schema 建議

- **WHEN** 使用者點擊「AI 推薦」按鈕且頁面有生成內容
- **THEN** 系統 SHALL 呼叫 Gemini API 分析頁面上下文
- **THEN** 系統 SHALL 回傳建議的 request body schema 與 response body schema
- **THEN** 建議結果 SHALL 以可編輯的 JSON 格式顯示於面板中

#### Scenario: AI 推薦過程中顯示載入狀態

- **WHEN** 使用者點擊「AI 推薦」且 API 呼叫進行中
- **THEN** 按鈕 SHALL 顯示載入狀態
- **THEN** 使用者 SHALL 無法重複點擊觸發

#### Scenario: AI 推薦失敗時顯示錯誤

- **WHEN** Gemini API 呼叫失敗或回傳無效結果
- **THEN** 系統 SHALL 顯示錯誤訊息
- **THEN** 使用者 SHALL 可以重新嘗試

### Requirement: 使用者可接受或修改 AI 建議

系統 SHALL 允許使用者接受 AI 建議的 schema 自動填入，或手動修改後再確認。

#### Scenario: 接受 AI 建議

- **WHEN** AI 推薦結果顯示後，使用者點擊「套用」按鈕
- **THEN** 建議的 schema SHALL 自動填入 API 綁定的 request/response body 欄位

#### Scenario: 修改後套用 AI 建議

- **WHEN** 使用者在推薦結果中修改 JSON schema 後點擊「套用」
- **THEN** 修改後的 schema SHALL 填入 API 綁定欄位

#### Scenario: 忽略 AI 建議

- **WHEN** 使用者點擊「取消」或關閉推薦結果
- **THEN** API 綁定欄位 SHALL 維持原本狀態不變
