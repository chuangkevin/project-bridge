## ADDED Requirements

### Requirement: Dark mode toggle
系統 SHALL 提供深色模式切換，使用者可在設定中切換明/暗主題。

#### Scenario: User enables dark mode
- **WHEN** 使用者在設定中開啟深色模式
- **THEN** 全站 SHALL 立即切換為深色主題，包含 sidebar、header、卡片背景、對話框

#### Scenario: Dark mode preference persists
- **WHEN** 使用者開啟深色模式後關閉瀏覽器再重新開啟
- **THEN** 系統 SHALL 自動載入深色主題

#### Scenario: System preference detection
- **WHEN** 使用者未手動設定主題且作業系統為深色模式
- **THEN** 系統 SHALL 預設使用深色主題
