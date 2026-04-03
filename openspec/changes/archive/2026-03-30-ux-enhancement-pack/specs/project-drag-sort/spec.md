## ADDED Requirements

### Requirement: Drag-and-drop project sorting
系統 SHALL 允許使用者在首頁透過拖曳方式重新排列專案卡片順序。

#### Scenario: User drags a project card to new position
- **WHEN** 使用者拖曳專案卡片到新位置並放開
- **THEN** 專案卡片 SHALL 立即顯示在新位置，排序結果持久化

#### Scenario: Sort order persists across sessions
- **WHEN** 使用者重新載入頁面
- **THEN** 專案卡片 SHALL 顯示為上次拖曳後的順序

#### Scenario: New projects appear at top
- **WHEN** 使用者建立新專案後回到首頁
- **THEN** 新專案 SHALL 出現在列表最上方
