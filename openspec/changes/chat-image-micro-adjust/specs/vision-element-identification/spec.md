## ADDED Requirements

### Requirement: Vision-micro-adjust flow activates when image is attached to micro-adjust message

When the chat route receives a message classified as `micro-adjust` AND the request includes `fileIds` referencing at least one file with `mime_type` starting with `image/` AND a current prototype exists, the server SHALL route to the vision-micro-adjust flow instead of the standard text-only micro-adjust.

#### Scenario: Image + text triggers vision flow
- **WHEN** a user sends a chat message with text "search box needs a dropdown" and an attached screenshot image
- **AND** a current prototype exists for the project
- **THEN** the server routes to the vision-micro-adjust flow
- **AND** the response uses targeted component replacement (not full-page regeneration)

#### Scenario: Text-only micro-adjust uses existing flow
- **WHEN** a user sends a chat message with text only (no attached image)
- **AND** the intent is classified as `micro-adjust`
- **THEN** the existing text-only micro-adjust flow is used (no change)

#### Scenario: Image attached but no prototype exists
- **WHEN** a user sends a message with an attached image but no prototype exists yet
- **THEN** the system falls through to the standard generation flow (full-page or in-shell)

### Requirement: Gemini Vision API identifies target element and generates replacement HTML

The server SHALL send a single multimodal Gemini API call with:
1. The pasted screenshot image as `inline_data`
2. The user's text instruction
3. The current prototype HTML (truncated to 20k chars if needed)

The system prompt SHALL instruct Gemini to return a JSON response: `{ "bridgeId": "...", "reasoning": "...", "componentHtml": "..." }` where `bridgeId` identifies the target `data-bridge-id` element, `reasoning` explains the identification logic, and `componentHtml` contains the replacement HTML for that element.

#### Scenario: Successful vision identification and generation
- **WHEN** Gemini Vision receives the image + instruction + prototype HTML
- **THEN** it returns a JSON response with a valid `bridgeId`, reasoning, and replacement `componentHtml`
- **AND** the `componentHtml` preserves the original `data-bridge-id` attribute on the root element

#### Scenario: Prototype HTML exceeds token limit
- **WHEN** the prototype HTML exceeds 20,000 characters
- **THEN** the system truncates it (keeping `<body>` content, stripping large `<style>` blocks)
- **AND** the truncated HTML is sent to the Vision API

### Requirement: Vision-micro-adjust response streamed as SSE with component swap

The vision-micro-adjust flow SHALL stream progress as SSE events to the client. On successful completion, the server SHALL:
1. Extract the `bridgeId` and `componentHtml` from the Gemini response
2. Use `replaceComponent()` to swap the component in the full prototype HTML
3. Save a new prototype version
4. Send the final SSE event with `{ done: true, html: <full-updated-html>, messageType: 'micro-adjust' }`

#### Scenario: Successful vision micro-adjust completes
- **WHEN** the vision flow successfully identifies and regenerates a component
- **THEN** the client receives SSE events including a final `done` event with the updated full HTML
- **AND** a new prototype version is saved with incremented version number

#### Scenario: Vision API returns invalid JSON
- **WHEN** Gemini Vision returns a response that is not valid JSON
- **THEN** the system attempts to extract JSON from markdown code fences
- **AND** if that fails, falls back to the standard text-only micro-adjust flow with the full response as HTML

### Requirement: New vision-micro-adjust system prompt

A new prompt file `packages/server/src/prompts/vision-micro-adjust.txt` SHALL define the system instruction for the vision-based element identification and generation. The prompt SHALL instruct the model to:
- Analyze the screenshot to understand what UI element or area the user is referring to
- Match it against the `data-bridge-id` elements in the provided prototype HTML
- Return ONLY the replacement HTML for the identified element
- Preserve the `data-bridge-id` attribute
- Follow existing design conventions and CSS variables

#### Scenario: Prompt file exists and is loaded
- **WHEN** the vision-micro-adjust flow is triggered
- **THEN** the system loads the prompt from `packages/server/src/prompts/vision-micro-adjust.txt`
