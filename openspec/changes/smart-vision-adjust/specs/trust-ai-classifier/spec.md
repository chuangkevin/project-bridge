## MODIFIED Requirements

### Requirement: AI classifier is the sole intent decision maker

All regex-based keyword patterns (`hasGenerateKeywords`, `hasModificationKeywords`, `isObviousGenerate`, `isPageRequest`, `hasDesignIntent`, `hasActionKeywords`) and their associated if/else override chains in `chat.ts` SHALL be removed. The AI vision classifier (`classifyIntent`) SHALL be the only mechanism that determines intent routing, with three explicit exceptions.

#### Scenario: "設計" in modification context routes correctly
- **GIVEN** a prototype exists for the project
- **WHEN** user sends "設計稿上加個tag"
- **THEN** the AI classifier determines intent (expected: micro-adjust)
- **AND** no regex override changes the classifier's decision

#### Scenario: "加上" no longer forces micro-adjust blindly
- **GIVEN** a prototype exists for the project
- **WHEN** user sends "加上一個完整的會員管理頁面"
- **THEN** the AI classifier determines intent (expected: full-page)
- **AND** no `hasModificationKeywords` regex forces it to micro-adjust

#### Scenario: "列表" in question context is not upgraded
- **GIVEN** a prototype exists AND user is in design mode
- **WHEN** user sends "列表頁的搜尋功能可以怎麼改善？"
- **THEN** the AI classifier determines intent (expected: question)
- **AND** no `hasActionKeywords` regex upgrades it to full-page

#### Scenario: No prototype still generates full-page
- **GIVEN** no prototype exists for the project
- **WHEN** user sends "幫我做一個電商網站"
- **THEN** the AI classifier determines intent (expected: full-page)

### Requirement: Three explicit overrides remain

The following three overrides SHALL remain and take precedence over the AI classifier:

1. `effectiveChatOnly` — when true, intent is forced to `'question'`
2. `targetBridgeId` — when present with an existing prototype, intent is forced to `'element-adjust'`
3. `effectiveForceRegenerate` — when true (user clicked regenerate button OR message matches explicit redesign phrases), intent is forced to `'full-page'` (or `'in-shell'` if shell exists)

#### Scenario: Chat-only mode always returns question
- **GIVEN** `effectiveChatOnly` is true
- **WHEN** user sends any message (even "幫我設計一個網站")
- **THEN** intent is `'question'`, AI classifier is not called

#### Scenario: Target bridge ID routes to element-adjust
- **GIVEN** `targetBridgeId` is "card-1" AND a prototype exists
- **WHEN** user sends "改成藍色"
- **THEN** intent is `'element-adjust'`, AI classifier is not called

#### Scenario: Force regenerate routes to full-page
- **GIVEN** `effectiveForceRegenerate` is true
- **WHEN** user sends any message
- **THEN** intent is `'full-page'` (or `'in-shell'` if shell exists), AI classifier is not called

### Requirement: Intent classifier prompt handles all edge cases

Since regex is removed, the `classifyIntent` prompt in `intentClassifier.ts` SHALL be reviewed and updated to handle cases previously covered by regex, including:
- Page requests ("加一個列表頁", "缺少設定頁")
- Files with design intent (image attachment + "設計" keyword)
- Action keywords in design mode that previously triggered upgrades

#### Scenario: Page request classified correctly
- **WHEN** user sends "我需要一個設定頁面" AND prototype exists
- **THEN** AI classifier returns `'full-page'` or `'in-shell'` (not micro-adjust)

#### Scenario: Image with design keyword classified correctly
- **WHEN** user sends "用這個設計" with an attached image AND prototype exists
- **THEN** AI classifier (with vision) returns `'micro-adjust'` or `'full-page'` based on image content

## REMOVED Requirements

### Removed: Keyword-based intent override chain
The entire regex-based override system (lines 263-348 in current `chat.ts`) is removed. This includes:
- `hasGenerateKeywords` regex and its usage
- `hasModificationKeywords` regex and its usage
- `hasTypeKeywords` regex and its usage
- `isObviousGenerate` flag and `gatedObviousGenerate` flag
- `isPageRequest` regex and its override block
- `hasDesignIntent` regex and its component-to-full-page override
- `hasActionKeywords` regex and its question-to-full-page upgrade
- The final if/else chain that overrides classifier results based on `hasModificationKeywords` and `isObviousGenerate`
