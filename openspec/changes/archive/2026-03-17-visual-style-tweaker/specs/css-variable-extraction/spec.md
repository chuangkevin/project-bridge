## ADDED Requirements

### Requirement: Extract CSS variables from prototype HTML
系統 SHALL 解析當前原型 HTML 的 `<style>` 標籤，找出所有在 `:root` 或頂層宣告的 CSS 變數（格式 `--xxx: value`），並回傳可編輯 token 清單。

#### Scenario: HTML contains CSS variables
- **WHEN** 原型 HTML 包含 `:root { --primary-color: #3b82f6; --border-radius: 8px; }`
- **THEN** 萃取結果包含 `{ name: '--primary-color', value: '#3b82f6', type: 'color' }` 與 `{ name: '--border-radius', value: '8px', type: 'size' }`

#### Scenario: HTML has no CSS variables
- **WHEN** 原型 HTML 不含任何 CSS 變數
- **THEN** 系統 SHALL fallback 掃描 HTML 中出現頻率最高的 `background-color`、`color`、`border-radius` 值，最多回傳 6 個 token

#### Scenario: Ignore tweaker injected styles
- **WHEN** HTML 包含 `<style id="__tweaker__">` 標籤
- **THEN** 萃取時 SHALL 忽略該標籤內容，避免循環讀取自身注入的樣式

### Requirement: Classify token type
系統 SHALL 根據 CSS 變數的值自動判斷 token 類型，以決定 UI 控制項形式。

#### Scenario: Color value detection
- **WHEN** CSS 變數值符合 hex (`#rrggbb`)、`rgb()`、`hsl()` 格式
- **THEN** token type SHALL 為 `color`，UI 顯示色票選色器

#### Scenario: Size value detection
- **WHEN** CSS 變數值結尾為 `px`、`rem`、`em`
- **THEN** token type SHALL 為 `size`，UI 顯示數值滑桿

#### Scenario: Font family detection
- **WHEN** CSS 變數名稱含 `font` 或值含逗號分隔的字型名稱
- **THEN** token type SHALL 為 `font`，UI 顯示下拉選單
