# design-generation-context

## ADDED Requirements

### Requirement: Active artifact source in design prompt
design mode 生成時，system prompt MUST 包含 active artifact 的完整 Vue SFC 原始碼（獨立 `## Active artifact source` 區段），而非僅 artifact ID。

#### Scenario: 修改既有設計
- **WHEN** 專案存在 active artifact 且使用者在 design mode 送出修改請求
- **THEN** 送往 provider 的 systemInstruction 包含該 artifact 的完整原始碼

#### Scenario: 無 active artifact
- **WHEN** 專案沒有 active artifact（首次生成）
- **THEN** systemInstruction 不包含 source 區段，生成行為與現狀相同

### Requirement: Oversized artifact degradation
當 active artifact 原始碼超過 60 KB 時，系統 MUST 改注入結構摘要（v-if 頁面清單、導覽標籤、元件名）並附明確警告文字，不得靜默截斷原始碼。

#### Scenario: 超大 artifact
- **WHEN** active artifact payload 超過 60 KB
- **THEN** systemInstruction 含結構摘要與「原始碼過大已省略」警告，且不含被攔腰截斷的原始碼
