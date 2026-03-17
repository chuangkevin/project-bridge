## ADDED Requirements

### Requirement: Intent classification before processing
The system SHALL classify every user message as either "generate" (create/modify UI) or "question" (ask about specs/design/prototype) using a fast OpenAI call before processing.

#### Scenario: Generate intent detected
- **WHEN** user sends "幫我做一個登入頁面"
- **THEN** system classifies as "generate" and proceeds with full HTML generation pipeline

#### Scenario: Question intent detected
- **WHEN** user sends "這個欄位最多幾個字？" or "這個按鈕的功能是什麼？"
- **THEN** system classifies as "question" and proceeds with Q&A response pipeline

### Requirement: Q&A response pipeline
When intent is "question", the system SHALL answer using the conversation history and uploaded spec content as context. It SHALL NOT generate HTML or create a new PrototypeVersion.

#### Scenario: Answer a spec question
- **WHEN** intent is "question"
- **THEN** system uses a Q&A system prompt, streams a text answer via SSE, saves both user and assistant messages to conversations table, does NOT create a new PrototypeVersion, does NOT update the prototype preview

#### Scenario: Conversation history as context
- **WHEN** user asks a follow-up question like "剛才提到的按鈕，有什麼限制？"
- **THEN** system includes conversation history in the Q&A prompt so it can answer with context

### Requirement: Visual distinction in chat panel
The system SHALL visually distinguish Q&A messages from generation messages in the chat panel.

#### Scenario: Q&A message appearance
- **WHEN** assistant responds with a Q&A answer
- **THEN** the chat bubble has a blue left border and a 💬 icon, with normal readable typography

#### Scenario: Generation message appearance
- **WHEN** assistant responds with a generated prototype
- **THEN** the chat bubble shows a "✅ 已生成原型" tag and uses a distinct background
