## ADDED Requirements

### Requirement: Micro-adjust keywords override full-page when prototype exists
When a prototype already exists for the project, messages containing modification verbs (「加上」「改成」「調整」「刪掉」「拿掉」「換成」「移到」「加個」「加一個」) SHALL be routed to micro-adjust, even if they also contain words like 「設計」or 「UI」.

#### Scenario: Add tag to existing page
- **WHEN** prototype exists AND user says "在卡片上加一個 tag"
- **THEN** intent is `micro-adjust`, not `full-page`

#### Scenario: Change title on existing page
- **WHEN** prototype exists AND user says "把標題改成紅色"
- **THEN** intent is `micro-adjust`

#### Scenario: Explicit regeneration still works
- **WHEN** prototype exists AND user says "重新設計整個網站"
- **THEN** intent is `full-page`

#### Scenario: New project without prototype
- **WHEN** no prototype exists AND user says "幫我設計一個購物網站"
- **THEN** intent is `full-page`

### Requirement: isObviousGenerate excludes modification verbs
The `isObviousGenerate` check SHALL NOT trigger when the message contains modification verbs (加上、改成、調整、刪掉、拿掉、換成) AND a prototype already exists. These indicate modification intent, not creation intent.

#### Scenario: Design keyword with modification verb
- **WHEN** prototype exists AND user says "設計稿上加個 tag"
- **THEN** `isObviousGenerate` is false, intent is `micro-adjust`

#### Scenario: Design keyword without modification verb
- **WHEN** no prototype exists AND user says "設計一個購物網站"
- **THEN** `isObviousGenerate` is true, intent is `full-page`

### Requirement: targetBridgeId bypasses intent classification
When the chat API receives `targetBridgeId` in the request body, the system SHALL skip intent classification entirely and route directly to element-targeted-adjust.

#### Scenario: Element selected before message
- **WHEN** request contains `{ message: "改成藍色", targetBridgeId: "card-1" }`
- **THEN** system skips classifyIntent, goes to element-targeted-adjust path
