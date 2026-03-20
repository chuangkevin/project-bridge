## MODIFIED Requirements

### Requirement: ChatPanel gains Regenerate button
The ChatPanel SHALL display a "重新生成" (Regenerate) button in the input area, next to the send button, when a prototype already exists for the project.

#### Scenario: Regenerate button visible after generation
- **WHEN** a prototype has been generated (onHtmlGenerated has been called at least once)
- **THEN** a "重新生成" button SHALL appear in the input area toolbar, visually distinct from the send button (e.g. orange/amber background)

#### Scenario: Regenerate button hidden before first generation
- **WHEN** no prototype exists for the project
- **THEN** the Regenerate button SHALL NOT be visible

#### Scenario: Regenerate button sends forceRegenerate flag
- **WHEN** user clicks the Regenerate button
- **THEN** the chat request SHALL include `forceRegenerate: true` in the request body, along with the current input text (or a default "重新生成原型" if input is empty)

#### Scenario: Regenerate button disabled during streaming
- **WHEN** a generation or micro-adjust is in progress (streaming = true)
- **THEN** both the send button and regenerate button SHALL be disabled

### Requirement: Send button behavior changes when prototype exists
- **WHEN** a prototype exists and the user clicks the send button (not regenerate)
- **THEN** the request SHALL NOT include `forceRegenerate`, allowing the server to classify as `micro-adjust`

#### Scenario: Send button tooltip indicates micro-adjust
- **WHEN** a prototype exists
- **THEN** the send button title/tooltip SHALL read "微調" instead of the default

### Requirement: Generation phase label reflects micro-adjust
- **WHEN** intent is `micro-adjust` and generation is in progress
- **THEN** the generation progress indicator SHALL show "微調中..." instead of "思考中..."/"撰寫中..."

### Requirement: Chat bubble label for micro-adjust
- **WHEN** assistant message has `messageType: 'micro-adjust'`
- **THEN** the chat bubble SHALL display a label "微調完成" with a distinct badge style (e.g. light blue background)

### Requirement: ChatPanel receives hasPrototype prop
ChatPanel SHALL accept a new prop `hasPrototype: boolean` (or derive it from messages containing generate/in-shell/component messageTypes) to determine whether to show the Regenerate button and change send behavior.
