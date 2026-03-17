## ADDED Requirements

### Requirement: Style tweaker tab in workspace
WorkspacePage SHALL 在右側面板 tab bar 新增「🎨 樣式」tab，點擊後顯示 StyleTweakerPanel。

#### Scenario: Tab visible only when prototype exists
- **WHEN** 專案有當前原型版本
- **THEN** 「🎨 樣式」tab SHALL 可點擊並顯示 StyleTweakerPanel

#### Scenario: Tab disabled without prototype
- **WHEN** 專案尚無任何原型版本
- **THEN** 「🎨 樣式」tab SHALL 顯示為 disabled 狀態，無法點擊

### Requirement: Display extracted tokens as editable controls
StyleTweakerPanel SHALL 列出從當前原型萃取的所有 token，依類型顯示對應控制項。

#### Scenario: Color token shows color picker
- **WHEN** token type 為 `color`
- **THEN** 顯示色票 (`<input type="color">`) 及旁邊的 hex 文字輸入框

#### Scenario: Size token shows slider
- **WHEN** token type 為 `size`
- **THEN** 顯示數值滑桿，範圍依 token 名稱推斷（borderRadius: 0–24px，fontSize: 10–24px，其餘 0–64px）

#### Scenario: Font token shows dropdown
- **WHEN** token type 為 `font`
- **THEN** 顯示下拉選單，選項包含：System、Sans-serif、Serif、Monospace

#### Scenario: No tokens extracted shows empty state
- **WHEN** 原型 HTML 無任何可萃取 token（包含 fallback 也無結果）
- **THEN** 顯示說明文字「此原型無偵測到可調整的樣式變數」

### Requirement: Save button persists changes
StyleTweakerPanel SHALL 提供「儲存樣式」按鈕，呼叫後端 PATCH 端點將當前樣式持久化。

#### Scenario: Save success shows toast
- **WHEN** 用戶點擊「儲存樣式」且 PATCH 成功
- **THEN** 顯示 toast「樣式已儲存」，持續 2.5 秒

#### Scenario: Save failure shows error toast
- **WHEN** PATCH 回傳錯誤
- **THEN** 顯示 toast「儲存失敗」

### Requirement: Panel reloads tokens when prototype changes
- **WHEN** AI 生成新原型（`onHtmlGenerated` 觸發）
- **THEN** StyleTweakerPanel SHALL 重新萃取新 HTML 的 token，清空先前微調值，重置控制項為新的預設值
