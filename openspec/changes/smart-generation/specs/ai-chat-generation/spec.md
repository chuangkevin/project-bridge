## MODIFIED Requirements

### Requirement: Context management with sliding window
The system SHALL use a sliding window of the last 20 conversation messages when calling the OpenAI API. Messages beyond the window SHALL be excluded.

#### Scenario: Conversation exceeds 20 messages
- **WHEN** a project has 30 conversation messages and user sends a new message
- **THEN** system includes only the last 20 messages plus the new message in the API call

### Requirement: System prompt instructs valid HTML output
The system SHALL use a system prompt that instructs the AI to generate a single valid HTML file with inline CSS and JS, semantic class names, and `data-bridge-id` attributes on interactive elements. When active, the system SHALL also inject: design profile block, art style block, and multi-page structure block into the prompt. Intent classification determines whether HTML generation or Q&A answering occurs.

#### Scenario: Generated output is valid single-file HTML
- **WHEN** intent is "generate"
- **THEN** the output SHALL be a complete HTML document with `<!DOCTYPE html>`, inline `<style>` and `<script>` tags, and no external dependencies

#### Scenario: Q&A response does not affect prototype
- **WHEN** intent is "question"
- **THEN** system returns a text answer, does not generate HTML, does not create PrototypeVersion

#### Scenario: All prompt injections active simultaneously
- **WHEN** intent is "generate", design profile is active, art style is active, and multi-page is detected
- **THEN** system prompt contains: base generation instructions + design profile block + art style block + multi-page structure block, in that order
