## Phase 1: Server — Vision prompt and element matcher utility

- [x] 1.1 Create `packages/server/src/prompts/vision-micro-adjust.txt` — system prompt instructing Gemini Vision to analyze a screenshot + user instruction + prototype HTML, identify the target `data-bridge-id` element, and return JSON `{ "bridgeId": "...", "reasoning": "...", "componentHtml": "..." }`
- [x] 1.2 Create `packages/server/src/services/elementMatcher.ts` — export `findElementByBridgeId(html, bridgeId)` returning `{ found, outerHtml? }` using `node-html-parser`
- [x] 1.3 In `elementMatcher.ts` — export `fuzzyMatchElement(html, reasoning, hints: { tag?, textContent?, classes? })` that scans all `data-bridge-id` elements, scores by tag match + text similarity + class overlap, returns best match with score > 0.5 or null
- [x] 1.4 Test: `packages/e2e/tests/api/element-matcher.spec.ts` — unit-level tests: exact match found, exact match not found, fuzzy match recovers hallucinated bridge-id, fuzzy match returns null when no good candidate
- [x] 1.5 Commit: "feat: add vision-micro-adjust prompt and element matcher utility"

## Phase 2: Server — Vision-micro-adjust flow in chat route

- [x] 2.1 In `packages/server/src/routes/chat.ts`, inside the micro-adjust branch, detect if `fileIds` includes an image file (`mime_type LIKE 'image/%'`) — if so, branch to vision-micro-adjust flow
- [x] 2.2 Load the pasted image from `uploaded_files.storage_path` as a Buffer; build Gemini multimodal content parts: `[{ inlineData: { mimeType, data: base64 } }, { text: instruction + truncated prototype HTML }]`
- [x] 2.3 Truncate prototype HTML to 20k chars if needed (strip large `<style>` blocks first, keep `<body>` content)
- [x] 2.4 Call `model.generateContent()` with the vision-micro-adjust prompt and multimodal parts; parse JSON response to extract `bridgeId`, `reasoning`, `componentHtml`
- [x] 2.5 Validate `bridgeId` exists using `findElementByBridgeId()`; if not found, attempt `fuzzyMatchElement()` with hints from the `reasoning` field; if still no match, fall back to standard text-only micro-adjust
- [x] 2.6 Use `replaceComponent()` from `componentExtractor.ts` to swap the component in the full prototype HTML; save new prototype version; stream SSE `{ done: true, html, messageType: 'micro-adjust' }`
- [x] 2.7 Handle JSON parse failures: try extracting JSON from markdown code fences; if that fails, fall back to standard micro-adjust flow
- [x] 2.8 Test: `packages/e2e/tests/api/vision-micro-adjust.spec.ts` — test that POST with image fileId + text + existing prototype triggers vision flow; test fallback when no image attached; test error handling when Vision API returns invalid JSON
- [x] 2.9 Commit: "feat: add vision-micro-adjust flow to chat route with Gemini Vision"

## Phase 3: Client — Clipboard image paste in chat textarea

- [x] 3.1 In `packages/client/src/components/ChatPanel.tsx`, add `onPaste` handler to the textarea: detect `clipboardData.items` with `type.startsWith('image/')`, convert to File, call existing `uploadFile()` with a `isClipboardImage: true` flag appended to FormData
- [x] 3.2 Extend `UploadedFile` interface with `isClipboardImage?: boolean`; set it from upload response
- [x] 3.3 For clipboard image file chips, show a small thumbnail preview (render `<img>` with `URL.createObjectURL` of the pasted file, max-width 80px) instead of just the filename text
- [x] 3.4 Skip analysis polling for files where `isClipboardImage === true` — set `analysisStatus: 'ready'` immediately
- [x] 3.5 Test: Playwright test `packages/e2e/tests/chat-image-paste.spec.ts` — simulate Ctrl+V paste with image data into the chat textarea; verify file chip appears with thumbnail; verify sending message with pasted image
- [x] 3.6 Commit: "feat: add clipboard image paste support in chat textarea"

## Phase 4: Client — Image thumbnail in message bubbles

- [x] 4.1 Extend `ChatMessage` interface with optional `imageUrl?: string` field
- [x] 4.2 In `sendMessage()`, when `attachedFiles` includes a clipboard image, set `imageUrl` on the user message (construct URL from `/api/projects/:id/upload/:fileId/file`)
- [x] 4.3 In the message bubble renderer, when `msg.imageUrl` is present, render `<img src={msg.imageUrl} style={{ maxWidth: 120, borderRadius: 8, marginBottom: 6 }} />` above the text content in the user bubble
- [x] 4.4 Test: Playwright test in `packages/e2e/tests/chat-image-paste.spec.ts` — verify that after sending a message with a pasted image, the user bubble shows an image thumbnail
- [x] 4.5 Commit: "feat: display image thumbnail in chat message bubbles"

## Phase 5: Server — Upload endpoint clipboard image flag

- [x] 5.1 In the upload route (`packages/server/src/routes/upload.ts` or wherever `POST /:id/upload` is handled), detect `isClipboardImage` field in FormData; if present, store it on the `uploaded_files` row (add column or use existing metadata JSON)
- [x] 5.2 When `isClipboardImage` is true, skip queuing the file for visual analysis and art-style extraction pipelines
- [x] 5.3 Return `isClipboardImage: true` in the upload response JSON
- [x] 5.4 Test: API test — upload with `isClipboardImage=true` returns the flag and does not trigger analysis
- [x] 5.5 Commit: "feat: support isClipboardImage flag in upload endpoint"

## Phase 6: Integration test — full pipeline

- [x] 6.1 Playwright E2E test `packages/e2e/tests/vision-micro-adjust-e2e.spec.ts`: create project, generate a prototype, paste a screenshot into chat, type an instruction, send, verify the prototype updates with a new version and the target component is modified
- [x] 6.2 Commit: "test: add E2E test for vision-based image micro-adjust pipeline"
