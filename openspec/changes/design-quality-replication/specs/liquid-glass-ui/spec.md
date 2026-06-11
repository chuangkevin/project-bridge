# liquid-glass-ui

## ADDED Requirements

### Requirement: Liquid glass token layer
client `theme.css` MUST 重寫為液態玻璃材質 token 體系（`--glass-*` 材質層、語意表面層），且既有 token 名稱 MUST 保留並指向新值，使既有 feature CSS 無需全面改寫即可套用新材質。

#### Scenario: 既有樣式吃到新材質
- **WHEN** theme.css 更新後載入任一既有頁面
- **THEN** 使用舊 token 名（如 `--bg-card`）的元素呈現新的玻璃材質視覺，無 CSS 變數 unresolved

### Requirement: Glass surfaces on primary chrome
TopBar、LeftRail、RightInspector、modal、聊天 Composer 與照抄選項列 MUST 套用 `.glass-*` 工具類（半透明 + backdrop-filter blur/saturate + 邊緣高光 + 大圓角）；聊天氣泡 MUST 使用無 blur 的低成本玻璃變體。

#### Scenario: 主要鍍鉻面為玻璃
- **WHEN** 開啟 workspace 頁
- **THEN** TopBar 與 LeftRail 呈現 backdrop-filter 玻璃效果（可由 computed style 驗證）

### Requirement: Graceful degradation without backdrop-filter
不支援 `backdrop-filter` 的環境 MUST 降級為實色半透明表面，版面與可讀性不受影響。

#### Scenario: 降級
- **WHEN** 瀏覽器不支援 backdrop-filter
- **THEN** `@supports` 規則生效，表面為實色半透明且文字對比度不低於原設計

### Requirement: Locale and theme invariants
restyle MUST 維持全介面繁體中文文案不變，支援深淺色且預設深色；AI 生成設計的風格仍由 global design style 控制，不受 client restyle 影響。

#### Scenario: 文案不變
- **WHEN** restyle 完成後巡覽全部頁面
- **THEN** 所有既有繁中文案原樣保留，無新增英文 placeholder
