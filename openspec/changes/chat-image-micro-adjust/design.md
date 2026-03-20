## Context

The chat panel (`ChatPanel.tsx`) already supports file attachment (drag-drop, file picker) and uploads files to `POST /api/projects/:id/upload`. Uploaded files go through text extraction and optional visual analysis, and their IDs are sent alongside chat messages as `fileIds`. The server chat route (`chat.ts`) already has a `micro-adjust` intent path that takes the user message + current prototype HTML and sends it to Gemini for targeted edits. The `componentExtractor.ts` service can extract/replace individual components by `data-bridge-id`. The `regenerate-component` endpoint in `prototypes.ts` already regenerates a single component given a `bridgeId` and `instruction`.

What is missing: there is no way to paste a screenshot directly into the chat textarea (clipboard image), and no vision-based flow that looks at a pasted image to identify which element the user is referring to and what change to make.

## Goals / Non-Goals

**Goals:**
- Accept image paste (Ctrl+V) on the chat textarea area, upload the pasted image, and show it as a thumbnail in the message input area
- When a message includes an image attachment AND the current prototype exists, route to a new `vision-micro-adjust` flow
- Use Gemini Vision API to analyze the pasted screenshot + user instruction + current prototype HTML to identify the target `data-bridge-id` element
- Generate a targeted component replacement using the existing `replaceComponent` utility
- Stream the result back to the client and update the prototype version

**Non-Goals:**
- Multi-image paste (one image per message is sufficient)
- Image annotation/drawing tools on the pasted image
- Changing the existing file upload flow (drag-drop, file picker) — those continue to work as before for design spec documents
- Supporting video or animated GIF input
- Storing pasted chat images permanently in the uploaded_files table with full analysis pipeline — they are ephemeral, stored only as base64 in the vision API call

## Decisions

### 1. Paste handler on textarea: intercept clipboard images

**Decision**: Add an `onPaste` handler to the chat textarea. When `clipboardData.items` contains an `image/*` type, prevent default, convert to a `File` object, upload via the existing `uploadFile()` flow, and mark the resulting `UploadedFile` with a new flag `isClipboardImage: true`. Display a small image thumbnail preview in the attached files area.

**Why**: Reuses the existing upload infrastructure. The `isClipboardImage` flag lets the server distinguish pasted screenshots from uploaded design spec documents, enabling different processing paths.

**Alternative considered**: Base64-encode the image client-side and send inline with the message — rejected because it bloats the JSON payload and breaks the existing SSE streaming pattern.

### 2. Server: new `vision-micro-adjust` intent branch in chat.ts

**Decision**: In the chat route, after intent classification, add a new condition: if `intent === 'micro-adjust'` AND the request includes `fileIds` where at least one file has `mime_type` starting with `image/` AND a current prototype exists, route to a `vision-micro-adjust` flow instead of the standard text-only micro-adjust.

**Why**: This avoids adding a separate endpoint. The existing chat SSE infrastructure handles streaming. The vision flow is a specialization of micro-adjust, not a fundamentally different operation.

### 3. Vision API call: single multimodal prompt with image + HTML + instruction

**Decision**: Send a single Gemini `generateContent` call with multimodal parts:
1. System instruction: "You are a prototype element surgeon. Given a screenshot, user instruction, and the current HTML, identify the target element by its `data-bridge-id` and return ONLY the replacement HTML for that element."
2. User parts: [image (inline_data), text with instruction + current prototype HTML]

The response format is a JSON block: `{ "bridgeId": "...", "reasoning": "...", "componentHtml": "..." }` — the bridge-id of the target, a brief reasoning, and the replacement HTML.

**Why**: A single API call is faster and cheaper than a two-step identify-then-generate flow. Gemini Vision can handle the combined task. The JSON response format makes extraction reliable.

**Alternative considered**: Two-step flow (Vision identify element -> separate call to generate HTML) — rejected for latency reasons. The single-call approach works because the prototype HTML is typically under 30k tokens.

### 4. Element matching fallback: fuzzy search if exact bridge-id not found

**Decision**: If the AI returns a `bridgeId` that does not exist in the current prototype (hallucination), attempt a fuzzy match: parse the AI's `reasoning` field for element type + text content hints, scan all `data-bridge-id` elements in the prototype, and pick the best match by element tag + text similarity. If no match scores above 0.5, return an error.

**Why**: Gemini Vision occasionally hallucinates bridge-id values. The fuzzy fallback recovers from this without requiring the user to retry.

### 5. Image storage: temporary, not persisted to uploaded_files analysis pipeline

**Decision**: Pasted clipboard images are uploaded via the existing `/upload` endpoint (which saves to disk and creates an `uploaded_files` row). However, for the vision-micro-adjust flow, the image is read from disk as a buffer and sent as `inline_data` to Gemini. No visual analysis pipeline is triggered for clipboard images (skip the art-style and design-spec analysis).

**Why**: Clipboard screenshots are transient context for a single micro-adjust operation. Running the full analysis pipeline would add unnecessary latency and storage overhead.

### 6. Client display: image thumbnail in user message bubble

**Decision**: When a user sends a message with an attached clipboard image, the user message bubble displays a small thumbnail (max 120px wide) of the image above the text content. The `ChatMessage` interface gains an optional `imageUrl?: string` field. The image URL points to the uploaded file's static serving path.

**Why**: Users need visual confirmation that their screenshot was received and processed. The thumbnail provides this without complex UI changes.

## Risks / Trade-offs

- **Token limits**: Sending the full prototype HTML + image to Gemini Vision may exceed context limits for very large prototypes (50k+ tokens). Mitigation: truncate prototype HTML to 20k chars, focusing on the `<body>` content and stripping `<style>` blocks that exceed 5k chars.
- **Bridge-id hallucination**: Gemini may return a bridge-id that doesn't exist. Mitigation: fuzzy matching fallback (Decision 4).
- **JSON parse failure**: Gemini may not return valid JSON. Mitigation: try extracting JSON from markdown code fences; if that fails, fall back to treating the entire response as replacement HTML for the most visually similar element.
- **Image quality**: Small or low-resolution screenshots may not give Gemini enough context to identify the element. Mitigation: include the user's text instruction as the primary signal; the image is supplementary context.
