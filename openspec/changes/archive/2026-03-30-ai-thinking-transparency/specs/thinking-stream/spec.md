## ADDED Requirements

### Requirement: Gemini thinking mode enabled for generation
The system SHALL enable Gemini `thinkingConfig` with `thinkingBudget: 2048` when calling `generateContentStream` for prototype generation (full-page, in-shell, component intents).

#### Scenario: Thinking tokens streamed via SSE
- **WHEN** user sends a generation request
- **THEN** server SHALL send SSE events with `type: 'thinking'` containing Gemini thinking token content before the HTML output tokens

#### Scenario: Thinking tokens separated from output tokens
- **WHEN** Gemini returns a chunk with `thought: true` part
- **THEN** server SHALL emit `{ type: 'thinking', content: '...' }` SSE event
- **WHEN** Gemini returns a chunk with regular text part (not thought)
- **THEN** server SHALL emit `{ content: '...' }` SSE event (existing format, backward compatible)

#### Scenario: Fallback when thinking mode not supported
- **WHEN** Gemini model does not support `thinkingConfig` (throws error)
- **THEN** server SHALL fall back to generation without thinking mode and proceed normally without `thinking` SSE events

### Requirement: Thinking events are optional and non-blocking
The system SHALL NOT delay or block HTML output waiting for thinking tokens. Thinking and output tokens SHALL be streamed in the order they arrive from Gemini.

#### Scenario: No thinking tokens available
- **WHEN** Gemini returns no thinking tokens (e.g., model doesn't support it)
- **THEN** generation SHALL proceed normally and front-end SHALL show generation progress without thinking content
