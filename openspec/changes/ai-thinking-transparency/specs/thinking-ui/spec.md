## ADDED Requirements

### Requirement: Thinking panel displays AI reasoning
The front-end SHALL display a collapsible panel showing AI thinking content in real-time during generation.

#### Scenario: Thinking content appears during generation
- **WHEN** SSE event `{ type: 'thinking', content }` is received
- **THEN** the thinking panel SHALL append the content and auto-scroll to the latest line

#### Scenario: Thinking panel is collapsible
- **WHEN** user clicks the collapse/expand toggle on the thinking panel
- **THEN** the panel SHALL toggle between collapsed (header only) and expanded (full content) states

#### Scenario: Thinking panel auto-collapses on completion
- **WHEN** generation completes (done event received)
- **THEN** the thinking panel SHALL automatically collapse after 1 second

### Requirement: Four-step progress stepper
The front-end SHALL display a 4-step progress indicator: 分析需求 → 規劃結構 → 生成程式碼 → 完成.

#### Scenario: Stepper updates on phase events
- **WHEN** SSE event `{ type: 'phase', phase: 'analyzing' }` is received
- **THEN** the stepper SHALL highlight "分析需求" as active

#### Scenario: Stepper shows completed steps
- **WHEN** phase transitions from 'analyzing' to 'generating'
- **THEN** "分析需求" step SHALL show as completed (checkmark) and "生成程式碼" SHALL be active

### Requirement: Token count display
The front-end SHALL display a live token count during generation showing the number of output tokens received.

#### Scenario: Token counter increments
- **WHEN** SSE `{ content }` events are received during generation
- **THEN** a token counter SHALL increment and display the approximate character count

### Requirement: Thinking panel hidden for non-generation
The thinking panel SHALL NOT appear for question-type responses or micro-adjustments.

#### Scenario: Question response without thinking panel
- **WHEN** AI responds to a question (messageType = 'answer')
- **THEN** no thinking panel SHALL be shown; response appears directly in chat
