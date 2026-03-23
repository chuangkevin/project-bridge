## ADDED Requirements

### Requirement: Project creation mode selection
系統 SHALL 在新增專案時提供模式選擇，讓使用者選擇「架構設計模式」或「設計模式」。

#### Scenario: User creates project in architecture mode
- **WHEN** 使用者在新增專案對話框選擇「架構設計模式」並提交
- **THEN** 系統建立專案並導航至工作區，預設開啟架構圖 tab

#### Scenario: User creates project in design mode
- **WHEN** 使用者在新增專案對話框選擇「設計模式」並提交
- **THEN** 系統建立專案並導航至工作區，預設開啟聊天面板

#### Scenario: Mode selection is required
- **WHEN** 使用者未選擇任何模式就嘗試提交
- **THEN** 系統 SHALL 顯示提示，要求選擇模式
