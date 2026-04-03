## ADDED Requirements

### Requirement: Send chat message with RAG context
The system SHALL accept user messages and respond using Gemini 2.5 Flash, automatically retrieving relevant file contents and diary entries as context via FTS5 search.

#### Scenario: Chat with relevant files
- **WHEN** user sends a message that matches keywords in uploaded files
- **THEN** system searches FTS5 index, retrieves top-10 relevant file excerpts, includes them in the Gemini prompt as context, and returns the AI response

#### Scenario: Chat with no relevant context
- **WHEN** user sends a general message with no matching files or diary entries
- **THEN** system responds using only the conversation history and long-term memories, without file context

#### Scenario: Chat referencing diary
- **WHEN** user asks about something recorded in their diary
- **THEN** system retrieves matching diary entries via FTS5 and includes them in the prompt

### Requirement: Conversation history
The system SHALL maintain conversation history per chat session, supporting multiple sessions.

#### Scenario: Continue a conversation
- **WHEN** user sends a message within an existing session
- **THEN** system includes prior messages from that session in the Gemini prompt

#### Scenario: Create new session
- **WHEN** user starts a new chat
- **THEN** system creates a new session with a unique ID and empty history

#### Scenario: List chat sessions
- **WHEN** user requests session list
- **THEN** system returns all sessions sorted by last activity, with title and message count

#### Scenario: Delete a session
- **WHEN** user deletes a chat session
- **THEN** system removes the session and all associated messages

### Requirement: Streaming response
The system SHALL stream AI responses using Server-Sent Events (SSE) for real-time display.

#### Scenario: Stream a response
- **WHEN** user sends a chat message
- **THEN** system opens an SSE connection and streams Gemini response tokens in real-time

### Requirement: Auto-generate session title
The system SHALL automatically generate a session title from the first user message using Gemini.

#### Scenario: First message in session
- **WHEN** user sends the first message in a new session
- **THEN** system generates a concise title (under 30 characters) from the message content
