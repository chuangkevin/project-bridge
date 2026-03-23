## MODIFIED Requirements

### Requirement: Annotation mode element selection
使用者在標註模式下點擊 iframe 中的元素時，系統 SHALL 正確觸發元素選取並開啟標註編輯器，不受 visual-edit-mode 邏輯影響。

#### Scenario: Click element in annotation mode
- **WHEN** 使用者切換至標註模式並點擊 iframe 中的元素
- **THEN** 系統 SHALL 發送 element-click 訊息並開啟標註編輯器，顯示該元素的 bridgeId

#### Scenario: Annotation mode takes priority over visual edit
- **WHEN** bridgeScript 收到點擊事件且 annotationMode 為 true
- **THEN** SHALL 優先處理 annotation 邏輯，不進入 visual-edit 分支

#### Scenario: API binding mode also works correctly
- **WHEN** 使用者切換至 API 綁定模式並點擊元素
- **THEN** 系統 SHALL 正確觸發 element-click 並開啟 API binding panel
