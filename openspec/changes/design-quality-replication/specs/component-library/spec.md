# component-library

## ADDED Requirements

### Requirement: Save selected element as component
使用者於預覽中選取元素後 MUST 能以「存為元件」將該子樹（template + 相關 style）連同名稱、描述、scope（project/global）存入 `components` table；整個 artifact 也 MUST 能存為元件。

#### Scenario: 元素入庫
- **WHEN** 使用者選取卡片元素並以名稱 `pricing-card` 存為 project 元件
- **THEN** components table 新增一筆含該子樹 template 與相關 style 的記錄，version=1

#### Scenario: 重複名稱
- **WHEN** 同 scope 已存在同名元件
- **THEN** 系統回報衝突並提供覆蓋（version+1）或改名選項，不靜默覆蓋

### Requirement: Component index injected into generation prompt
design 與 replicate 模式生成時，system prompt MUST 包含當前 scope 可用元件索引（名稱 + 描述），並指示 AI 引用元件時只輸出 `<lib-component name="..."/>` 佔位符、不得自行重寫元件內容。

#### Scenario: 索引注入
- **WHEN** 專案存在 3 個元件且使用者觸發 design 生成
- **THEN** systemInstruction 含 3 個元件的名稱與描述及佔位符使用指示

### Requirement: Verbatim placeholder expansion
artifact 解析後，系統 MUST 將 `<lib-component name="X"/>` 佔位符以庫中元件原始碼**原樣**展開（template 替換 + style 合併去重）；展開不得經過任何 AI 改寫。

#### Scenario: 原樣展開
- **WHEN** AI 輸出含 `<lib-component name="pricing-card"/>`
- **THEN** 最終 artifact 中該位置為庫中 `pricing-card` 的 template 原文，逐字元相等

#### Scenario: 未知元件名
- **WHEN** AI 引用了庫中不存在的元件名
- **THEN** 系統發出明確 SSE error 事件，該佔位符替換為含警告註解的空容器，artifact 仍可預覽

### Requirement: Component refinement versioning
對元件的修改 MUST 走元素軌道編輯並使 version 遞增，舊版本保留可查。

#### Scenario: 精雕元件
- **WHEN** 使用者修改元件 `pricing-card` 的樣式並儲存
- **THEN** 元件 version 變為 2，version 1 內容仍可讀取
