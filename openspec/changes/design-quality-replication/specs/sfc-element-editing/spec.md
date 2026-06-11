# sfc-element-editing

## ADDED Requirements

### Requirement: SFC subtree locate, extract, replace
系統 MUST 提供 `sfcSurgeon` service，能依結構路徑（tag + 同名序數）在 Vue SFC template 中定位、抽取、替換元素子樹，且未被替換的內容在序列化後 MUST 與原文保持位元等價（round-trip fidelity）。

#### Scenario: Round-trip 不變性
- **WHEN** 對 SFC 執行 extract 後不做任何修改直接 replace 回原位
- **THEN** 序列化結果與原始 template 完全一致（含 v-if/v-for/@click/中文內容/註解）

#### Scenario: 路徑定位 v-for 重複節點
- **WHEN** template 中存在多個同名兄弟節點且路徑指向第 n 個
- **THEN** 抽取到的是第 n 個節點的子樹，不發生歧義

### Requirement: Element-track editing
使用者於預覽 iframe 選取元素後送出修改指令時，系統 MUST 只將該子樹（含相關 style 與 design tokens）提供給 AI，並以回傳子樹原位替換；選取範圍外的 template 內容 MUST 不變。

#### Scenario: 元素級修改
- **WHEN** 使用者選取 hero 區塊並要求「按鈕改圓角」
- **THEN** 僅 hero 子樹被替換，artifact 其餘部分與修改前位元等價

#### Scenario: 回傳子樹驗證失敗自動降級
- **WHEN** AI 回傳的子樹 parse 失敗或非單一根節點
- **THEN** 系統自動改走整頁軌道（完整原始碼 + 保留指令）並透過 SSE 告知降級

### Requirement: Page-track editing preserves source context
未選取元素的修改請求 MUST 走整頁重生，且 prompt MUST 含完整現有原始碼與嚴格保留未提及部分的指令。

#### Scenario: 整頁修改
- **WHEN** 使用者未選元素直接要求「整體配色改暖色」
- **THEN** 生成呼叫的 context 含完整現有 SFC 原始碼
