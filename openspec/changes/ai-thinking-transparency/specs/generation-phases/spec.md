## ADDED Requirements

### Requirement: Four-phase generation lifecycle
The system SHALL emit phase events during generation with exactly four phases: `analyzing`, `planning`, `generating`, `done`.

#### Scenario: Phase transitions during generation
- **WHEN** first thinking token arrives from Gemini
- **THEN** server SHALL emit `{ type: 'phase', phase: 'analyzing', message: '分析需求中...' }`

#### Scenario: Planning phase for multi-page
- **WHEN** `analyzePageStructure` is invoked for multi-page detection
- **THEN** server SHALL emit `{ type: 'phase', phase: 'planning', message: '規劃頁面結構...' }`

#### Scenario: Generating phase when HTML output starts
- **WHEN** first non-thinking output token arrives from Gemini
- **THEN** server SHALL emit `{ type: 'phase', phase: 'generating', message: '生成程式碼...' }`

#### Scenario: Done phase
- **WHEN** generation completes successfully
- **THEN** server SHALL emit `{ type: 'phase', phase: 'done' }` before the existing `{ done: true, html, ... }` event

### Requirement: Phase events for non-generation intents
For `question` and `micro-adjust` intents, the system SHALL emit only `analyzing` and `done` phases (skip `planning` and `generating`).

#### Scenario: Question intent phases
- **WHEN** user asks a question (intent = 'question')
- **THEN** server SHALL emit `analyzing` phase when processing starts and `done` phase when answer is complete

### Requirement: Backward compatible SSE events
All existing SSE event formats (`{ content }`, `{ done, html }`, `{ error }`) SHALL continue to work unchanged. The `type` field is additive — clients that don't handle it SHALL ignore it safely.

#### Scenario: Legacy client ignores new events
- **WHEN** a client does not handle `type: 'thinking'` or `type: 'phase'` events
- **THEN** the client SHALL still receive `{ content }` and `{ done }` events and function correctly
