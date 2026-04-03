## ADDED Requirements

### Requirement: Auto-extract memories from conversations
The system SHALL automatically extract important facts and context from each conversation and store them as long-term memories after a chat session ends or after every N messages.

#### Scenario: Extract memory after conversation
- **WHEN** a chat session has 5+ messages and user starts a new session or is idle for 10 minutes
- **THEN** system sends the conversation to Gemini with a prompt to extract key facts, preferences, and context, then stores each as a memory record

#### Scenario: No meaningful content
- **WHEN** conversation is trivial (greetings only, very short)
- **THEN** system does not extract any memories

### Requirement: Include memories in chat context
The system SHALL include relevant long-term memories in the AI prompt when responding to user messages.

#### Scenario: Relevant memories found
- **WHEN** user asks a question that matches existing memories via keyword search
- **THEN** system includes top-20 relevant memories in the system prompt as context

#### Scenario: New conversation with memories
- **WHEN** user starts a new chat session
- **THEN** system includes the 10 most recent memories in the system prompt

### Requirement: View and manage memories
The system SHALL provide an API and UI to list, view, and delete stored memories.

#### Scenario: List memories
- **WHEN** user requests memory list
- **THEN** system returns all memories sorted by creation date, with content preview and source session ID

#### Scenario: Delete a memory
- **WHEN** user deletes a specific memory
- **THEN** system removes it from the database and FTS5 index

#### Scenario: Search memories
- **WHEN** user searches memories with a keyword
- **THEN** system returns matching memories via FTS5 search

### Requirement: Memory deduplication
The system SHALL avoid storing duplicate or near-duplicate memories.

#### Scenario: Similar memory exists
- **WHEN** system extracts a memory that is semantically similar to an existing one
- **THEN** system updates the existing memory's timestamp instead of creating a duplicate (similarity check via Gemini)
