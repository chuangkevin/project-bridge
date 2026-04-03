## Why

Currently, every chat message triggers the full AI generation pipeline — even minor requests like "make the button bigger" or "change the header color to blue" cause the entire prototype to be regenerated from scratch. This is slow (10-30 seconds), expensive (full token usage), and destructive (loses manual edits, drag adjustments, and API bindings). Users expect chat messages to produce small, targeted changes while preserving the rest of the prototype. Full regeneration should only happen when the user explicitly requests it.

## What Changes

- **New intent type `micro-adjust`**: The intent classifier gains a fifth intent category for small CSS/HTML modifications. Messages like "把按鈕變大", "change header color", "add padding to the card" are classified as `micro-adjust` instead of `full-page`
- **Micro-adjust generation flow**: When intent is `micro-adjust`, the system sends only the current prototype HTML + the user instruction to AI, with a prompt that instructs the AI to return a minimal CSS/HTML patch (not a full page). The patch is applied on top of the existing prototype
- **Explicit Regenerate button**: A new "Regenerate" button is added to the chat panel toolbar. Clicking it triggers a full generation that reads all design specs, reference files, design profile, and conversation context to produce a fresh prototype from scratch
- **Chat messages default to micro-adjust**: When a prototype already exists and the user sends a chat message that is not a question and does not explicitly request full regeneration, the default intent is `micro-adjust`
- **Regenerate reads full context**: The regenerate flow re-reads all design specs, uploaded files, design profile, platform shell, and design tokens before generating — ensuring the fresh output reflects the latest project state

## Capabilities

### New Capabilities
- `micro-adjust-generation`: Chat messages classified as `micro-adjust` produce targeted CSS/HTML patches applied to the existing prototype rather than full regeneration; AI receives current HTML + instruction and returns only the changed elements/styles

### Modified Capabilities
- `generation-intent-classification`: Extended from four intents (`full-page`, `in-shell`, `component`, `question`) to five intents (`full-page`, `in-shell`, `component`, `question`, `micro-adjust`); default intent when prototype exists changes from `full-page` to `micro-adjust`
- `ai-chat-generation`: Chat panel gains a "Regenerate" button in the toolbar; chat message submission no longer triggers full generation by default when a prototype exists; full generation only occurs via the Regenerate button or explicit `full-page` intent
- `context-aware-generation`: Regenerate button flow re-reads all project context (design specs, uploaded files, design profile, shell, tokens) before generating; micro-adjust flow only needs current HTML + instruction

## Impact

- **Server**: `classifyIntent` function updated with `micro-adjust` intent and associated keywords/rules; new micro-adjust prompt template that instructs AI to return CSS/HTML patches only; `chat.ts` route branches on intent to choose micro-adjust vs full generation flow
- **Client**: ChatPanel toolbar gains "Regenerate" button (distinct from send); send button behavior changes to micro-adjust when prototype exists; UI feedback distinguishes "adjusting..." from "generating..."
- **AI prompts**: New micro-adjust system prompt instructing minimal patch output; existing generation prompt unchanged but only triggered via Regenerate
- **DB schema**: No changes — micro-adjust patches are stored as regular prototype versions
