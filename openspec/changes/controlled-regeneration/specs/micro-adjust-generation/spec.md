## ADDED Requirements

### Requirement: Micro-adjust generation produces targeted HTML changes
When intent is `micro-adjust`, the system SHALL send the current prototype HTML together with the user instruction to AI, using a micro-adjust system prompt that instructs the AI to return the complete HTML with only the requested changes applied.

#### Scenario: Style change via micro-adjust
- **WHEN** user sends "把標題顏色改成紅色" and a prototype already exists
- **THEN** the system SHALL send the current prototype HTML + user message to AI with the micro-adjust prompt, and the AI response SHALL be a complete HTML document with only the header color changed

#### Scenario: Layout tweak via micro-adjust
- **WHEN** user sends "add more padding to the cards" and a prototype exists
- **THEN** the returned HTML SHALL have increased card padding while all other elements remain unchanged

#### Scenario: Micro-adjust output stored as new prototype version
- **WHEN** micro-adjust generation completes
- **THEN** the output HTML SHALL be stored in `prototype_versions` as a new version with `is_current = 1`, same as full generation

#### Scenario: Micro-adjust output sanitized
- **WHEN** micro-adjust returns HTML
- **THEN** the existing `sanitizeGeneratedHtml` and `injectConventionColors` functions SHALL run on the output before storing

### Requirement: Micro-adjust system prompt constrains AI output
The micro-adjust system prompt SHALL instruct the AI to:
1. Return the COMPLETE HTML document (not a diff or patch)
2. Change ONLY what the user explicitly requested
3. Preserve all existing styles, layout, scripts, and content exactly
4. Not add new pages, navigation, or structural changes
5. Not re-generate content from design specs

#### Scenario: AI preserves unrelated content
- **WHEN** user says "make the button bigger" via micro-adjust
- **THEN** the AI output SHALL preserve all page content, navigation, colors, fonts, and layout except the targeted button size

### Requirement: Micro-adjust uses reduced token limit
The micro-adjust generation SHALL use `maxOutputTokens: 32768` (half of full generation's 65536) to reduce cost and latency.

#### Scenario: Token limit applied
- **WHEN** micro-adjust generation starts
- **THEN** the Gemini model SHALL be configured with `maxOutputTokens: 32768`

### Requirement: Micro-adjust skips heavy context loading
The micro-adjust flow SHALL NOT load design specs, architecture blocks, design convention, global/project design profiles, art style, or platform shell into the prompt. It only needs current HTML + user instruction.

#### Scenario: Faster generation
- **WHEN** intent is `micro-adjust`
- **THEN** the server SHALL skip all context-loading steps (spec rows, architecture block, design convention, global profile, project profile, art style, shell context) and proceed directly to AI call with current HTML + micro-adjust prompt

### Requirement: Micro-adjust SSE response includes messageType
- **WHEN** micro-adjust generation completes
- **THEN** the SSE done event SHALL include `messageType: 'micro-adjust'` and `intent: 'micro-adjust'`

### Requirement: Micro-adjust message stored with type
- **WHEN** micro-adjust generation completes
- **THEN** the assistant message in `conversations` SHALL have `message_type = 'micro-adjust'`
