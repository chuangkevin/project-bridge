## MODIFIED Requirements

### Requirement: Extract CSS variables from prototype HTML
系統 SHALL 解析當前原型 HTML 的 `<style>` 標籤，找出所有在 `:root` 或頂層宣告的 CSS 變數（格式 `--xxx: value`），並回傳可編輯 token 清單。When a project has compiled `design_tokens`, the system SHALL prefer reading tokens from the design_tokens JSON instead of parsing HTML, falling back to HTML parsing only when design_tokens is null.

#### Scenario: Project has design_tokens
- **WHEN** project has `design_tokens` column with compiled token JSON
- **THEN** system reads token values from the JSON (colors, typography, spacing) and converts them to the CSS variable format for the style tweaker

#### Scenario: HTML contains CSS variables but no design_tokens
- **WHEN** prototype HTML contains `:root { --primary-color: #3b82f6; }` AND project has no `design_tokens`
- **THEN** system extracts from HTML as before (backward compatible)

#### Scenario: Ignore tweaker injected styles
- **WHEN** HTML 包含 `<style id="__tweaker__">` 標籤
- **THEN** 萃取時 SHALL 忽略該標籤內容，避免循環讀取自身注入的樣式
