## 1. Dependencies

- [x] 1.1 Add `node-html-parser` to `packages/server/package.json` and install

## 2. Server: Component Extraction Utility

- [x] 2.1 Create `packages/server/src/services/componentExtractor.ts` — exports `extractComponent(html: string, bridgeId: string): string | null` using node-html-parser
- [x] 2.2 Export `replaceComponent(html: string, bridgeId: string, newHtml: string): string` — replaces outerHTML of matching element; validates bridge-id present in newHtml before replacing

## 3. Server: Regenerate-Component Route

- [x] 3.1 Add `POST /:id/prototype/regenerate-component` handler in `packages/server/src/routes/prototypes.ts`
- [x] 3.2 Validate request: require `bridgeId` (string) and `instruction` (string), return 400 if missing
- [x] 3.3 Fetch current prototype HTML; return 404 if none
- [x] 3.4 Extract component by bridgeId; return 404 if not found
- [x] 3.5 Build component regeneration system prompt: include component HTML, surrounding context (200 chars before/after), design spec analysis, design profile tokens, and instruction; enforce "return only the component HTML" constraint
- [x] 3.6 Stream AI response as SSE (same pattern as chat.ts); on completion replace component in full HTML and save new prototype version
- [x] 3.7 Send `{ done: true, html: newComponentHtml, bridgeId }` as final SSE event

## 4. Bridge Script: swap-component Message

- [x] 4.1 In `packages/client/src/utils/bridgeScript.ts`, add handler for `swap-component` message: find element by `data-bridge-id`, replace its `outerHTML` with the provided `html`

## 5. Client: Regenerate UI

- [x] 5.1 In annotation popup (find where annotation click is handled in `ChatPanel.tsx` or `WorkspacePage.tsx`), add a "Regenerate" button visible in annotation mode when an annotated element is clicked
- [x] 5.2 Clicking Regenerate shows an inline `<textarea>` pre-filled with the annotation content; has a Send button
- [x] 5.3 On submit: call `POST /api/projects/:id/prototype/regenerate-component` as SSE stream; show spinner/progress in the popup
- [x] 5.4 On SSE `done`: send `swap-component` PostMessage to iframe; hide spinner; show "✓ Component updated" toast
- [x] 5.5 On error: show error message in popup

## 6. Tests

- [x] 6.1 Add API test `packages/e2e/tests/api/component-regeneration.spec.ts`: POST with missing fields → 400; POST on project with no prototype → 404; POST with invalid bridgeId → 404
- [x] 6.2 Add test: seed a prototype with a known bridge-id, POST regenerate-component with a valid instruction (mocked or real API key), verify response has `done: true` and `html` contains the bridge-id
