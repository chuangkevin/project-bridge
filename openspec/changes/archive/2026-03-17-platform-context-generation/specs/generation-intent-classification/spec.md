## ADDED Requirements

### Requirement: Four-way intent classification
系統 SHALL 將使用者訊息分類為四種 intent：`full-page`、`in-shell`、`component`、`question`。

#### Scenario: Question intent
- **WHEN** 訊息為問句或詢問型（「為什麼」「怎麼」「是什麼」「有沒有」）
- **THEN** intent SHALL 為 `question`

#### Scenario: Component intent
- **WHEN** 訊息含有元件相關關鍵字（「元件」「card」「modal」「彈窗」「表單」「form」「widget」「badge」「tag」「chip」「dropdown」「picker」）
- **THEN** intent SHALL 為 `component`

#### Scenario: In-shell intent when shell exists
- **WHEN** 專案已設定 platform shell 且訊息描述新增子頁、功能頁、詳細頁（「子頁」「明細」「詳情」「新增頁面」「功能頁」「list」「detail」）
- **THEN** intent SHALL 為 `in-shell`

#### Scenario: Full-page intent
- **WHEN** 訊息含「整頁」「完整設計」「重新設計」「landing page」「獨立頁面」，或專案無 platform shell
- **THEN** intent SHALL 為 `full-page`（與現有 `generate` 行為相同）

#### Scenario: Default when shell exists
- **WHEN** 專案已有 shell，訊息為一般生成請求且無明顯 component 或 full-page 訊號
- **THEN** intent SHALL 預設為 `in-shell`

### Requirement: Intent classification uses project shell context
`classifyIntent` 函式 SHALL 接受額外參數 `hasShell: boolean`，影響分類邏輯。

#### Scenario: No shell — in-shell never returned
- **WHEN** `hasShell = false`
- **THEN** 分類結果 SHALL 不可為 `in-shell`（fallback 為 `full-page`）
