## ADDED Requirements

### Requirement: Send chat message and receive AI-generated prototype
The system SHALL accept a user message via POST `/api/projects/:id/chat` and return an AI-generated HTML/CSS/JS prototype as a streaming SSE response.

#### Scenario: First message generates initial prototype
- **WHEN** user sends a message describing a UI requirement for a project with no prior conversation
- **THEN** system sends the message to OpenAI API with the system prompt, streams the response via SSE, and stores the conversation entry and generated HTML as a new PrototypeVersion

#### Scenario: Follow-up message modifies existing prototype
- **WHEN** user sends a modification request for a project with existing conversation history
- **THEN** system includes the conversation history (sliding window of last 20 messages) in the OpenAI API call, streams the updated HTML response, and stores a new PrototypeVersion

#### Scenario: OpenAI API error
- **WHEN** user sends a message and the OpenAI API returns an error or is unreachable
- **THEN** system sends an SSE error event with a user-friendly message and does not create a conversation entry or prototype version

### Requirement: Conversation history
The system SHALL maintain conversation history per project and return it via GET `/api/projects/:id/conversations`.

#### Scenario: Retrieve conversation history
- **WHEN** user requests GET `/api/projects/:id/conversations`
- **THEN** system returns all conversation messages for the project in chronological order, each with id, role (user/assistant), content, and createdAt

### Requirement: System prompt instructs valid HTML output
The system SHALL use a system prompt that instructs the AI to generate a single valid HTML file with inline CSS and JS, semantic class names, and `data-bridge-id` attributes on interactive elements.

#### Scenario: Generated output is valid single-file HTML
- **WHEN** AI generates a response
- **THEN** the output SHALL be a complete HTML document with `<!DOCTYPE html>`, inline `<style>` and `<script>` tags, and no external dependencies

### Requirement: Context management with sliding window
The system SHALL use a sliding window of the last 20 conversation messages when calling the OpenAI API. Messages beyond the window SHALL be excluded.

#### Scenario: Conversation exceeds 20 messages
- **WHEN** a project has 30 conversation messages and user sends a new message
- **THEN** system includes only the last 20 messages plus the new message in the API call

### Requirement: Chat interface
The system SHALL provide a chat panel in the project workspace where users can type messages and see AI responses in real-time as they stream.

#### Scenario: User sends message via chat panel
- **WHEN** user types a message and presses send
- **THEN** system displays the user message immediately, shows a loading indicator, and progressively renders the AI response as SSE chunks arrive

#### Scenario: Streaming display
- **WHEN** AI response is streaming
- **THEN** the chat panel shows the response text building up in real-time, and the prototype preview updates after streaming completes
