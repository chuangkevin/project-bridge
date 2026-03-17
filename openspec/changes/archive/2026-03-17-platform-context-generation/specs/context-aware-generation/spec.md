## ADDED Requirements

### Requirement: full-page intent uses existing generation flow
- **WHEN** intent 為 `full-page`
- **THEN** 生成流程 SHALL 與現有 `generate` 路徑完全相同，不注入 shell

#### Scenario: Full-page output stored as prototype version
- **WHEN** full-page 生成完成
- **THEN** 輸出 HTML SHALL 存入 `prototype_versions`，`is_current = 1`

### Requirement: in-shell intent injects shell context into prompt
- **WHEN** intent 為 `in-shell` 且專案有 platform shell
- **THEN** 系統 SHALL 在 system prompt 中注入 shell 結構說明（前 3000 字元），並指示 AI 只輸出 `<main>` 內容（不含 doctype/html/head/nav/aside）

#### Scenario: Compose in-shell output with shell
- **WHEN** AI 輸出 `in-shell` 內容後
- **THEN** 後端 SHALL 將 shell HTML 的 `{CONTENT}` 替換為 AI 輸出，組成完整 HTML，存入 `prototype_versions`

#### Scenario: in-shell output missing main tag
- **WHEN** AI 輸出包含完整 `<!DOCTYPE html>` 結構（誤判）
- **THEN** 系統 SHALL fallback 擷取 `<main>` 內容插入 shell；若無 main 標籤，直接插入完整輸出

### Requirement: component intent generates fragment only
- **WHEN** intent 為 `component`
- **THEN** 系統 SHALL 在 system prompt 中指示 AI 只輸出元件 HTML+CSS 片段（不含 doctype/html/body）

#### Scenario: Component output wrapped for preview
- **WHEN** AI 輸出元件片段
- **THEN** 後端 SHALL 將片段包入預覽用 wrapper HTML（`<!DOCTYPE html><html><body style="display:flex;justify-content:center;align-items:center;min-height:100vh;padding:24px;background:#f8fafc;">{FRAGMENT}</body></html>`），存入 `prototype_versions`

#### Scenario: Component intent SSE response includes messageType component
- **WHEN** component 生成完成送出 SSE done 事件
- **THEN** `messageType` SHALL 為 `'component'`，前端可顯示「🧩 已生成元件」標籤

### Requirement: Generation label in chat reflects intent
- **WHEN** 生成完成
- **THEN** 對話中的生成標籤 SHALL 依 intent 顯示：
  - `full-page` → `✅ 已生成原型`
  - `in-shell` → `✅ 已生成子頁`
  - `component` → `🧩 已生成元件`

### Requirement: Platform Shell UI in DesignPanel
DesignPanel SHALL 新增「平台 Shell」section，讓使用者設定或擷取 shell。

#### Scenario: Extract shell from current prototype
- **WHEN** 使用者點擊「從現有原型擷取 Shell」按鈕
- **THEN** 呼叫 extract 端點，成功後顯示 shell HTML 預覽（前 200 字元 + toast）

#### Scenario: Manually paste shell HTML
- **WHEN** 使用者在 textarea 中貼上 shell HTML 並點擊儲存
- **THEN** 呼叫 PUT 端點儲存，顯示 toast「Platform Shell 已儲存」

#### Scenario: Shell active indicator
- **WHEN** 專案已有 platform shell
- **THEN** DesignPanel SHALL 顯示「Platform Shell 已啟用」badge，WorkspacePage tab-design SHALL 顯示 shell 狀態指示
