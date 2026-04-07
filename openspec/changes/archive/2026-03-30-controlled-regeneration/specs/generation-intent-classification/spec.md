## MODIFIED Requirements

### Requirement: Five-way intent classification (was: four-way)
The system SHALL classify user messages into five intents: `full-page`, `in-shell`, `component`, `question`, `micro-adjust`.

#### Scenario: Micro-adjust intent for style tweaks
- **WHEN** message contains style/layout adjustment keywords ("變大", "變小", "顏色改", "change color", "add padding", "字體", "間距", "背景色", "粗體", "邊框", "圓角", "margin", "font size", "bigger", "smaller", "wider", "narrower")
- **THEN** intent SHALL be `micro-adjust`

#### Scenario: Micro-adjust intent for minor element changes
- **WHEN** message describes a small targeted change to a specific element ("把按鈕變大", "header 顏色改藍色", "card 加陰影", "增加 padding")
- **THEN** intent SHALL be `micro-adjust`

#### Scenario: Existing intents preserved
- **WHEN** message is a question, component request, full-page request, or in-shell request
- **THEN** intent classification SHALL behave exactly as before (no regression)

### Requirement: Default intent override when prototype exists
In `chat.ts`, after classification, if a current prototype exists AND `forceRegenerate` is not set AND the classified intent is `full-page` or `in-shell`, the intent SHALL be overridden to `micro-adjust`.

#### Scenario: Chat message defaults to micro-adjust after generation
- **WHEN** user sends "修改排版" and a prototype already exists and `forceRegenerate` is false
- **THEN** intent SHALL be overridden from `full-page` to `micro-adjust`

#### Scenario: Question intent not overridden
- **WHEN** user sends "這個頁面有幾個元件?" and a prototype exists
- **THEN** intent SHALL remain `question` (not overridden)

#### Scenario: Component intent not overridden
- **WHEN** user sends "做一個 modal 元件" and a prototype exists
- **THEN** intent SHALL remain `component` (not overridden)

#### Scenario: forceRegenerate bypasses override
- **WHEN** request body includes `forceRegenerate: true`
- **THEN** intent SHALL NOT be overridden to `micro-adjust`, preserving the classified intent

### Requirement: Fast-path regex gated by prototype existence
The `isObviousGenerate` fast-path in `chat.ts` SHALL only trigger when no current prototype exists OR `forceRegenerate` is true.

#### Scenario: Fast-path skipped when prototype exists
- **WHEN** user sends "產生" and a prototype already exists and `forceRegenerate` is false
- **THEN** the fast-path SHALL NOT fire; the message SHALL go through the classifier, and the result SHALL be overridden to `micro-adjust`

#### Scenario: Fast-path works for first generation
- **WHEN** user sends "產生" and no prototype exists
- **THEN** the fast-path SHALL fire as before, producing `full-page` or `in-shell` intent
