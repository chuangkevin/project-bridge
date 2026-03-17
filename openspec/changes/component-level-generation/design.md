## Context

The prototype is stored as a single HTML string in `prototype_versions.html`. Components are delineated by `data-bridge-id` attributes on every interactive element (buttons, cards, inputs, nav items). The bridge script already supports message-based communication between the parent app and the iframe. The `PATCH /prototype/styles` endpoint already mutates HTML in-place. Annotations already store `bridge_id` as their primary targeting key.

## Goals / Non-Goals

**Goals:**
- Extract a component's outer HTML by bridge-id using DOM parsing
- Send extracted HTML + instruction + design spec context to AI for targeted rewrite
- Splice updated component HTML back into the full prototype string
- Stream the regeneration response (SSE, same as full generation)
- Inject updated component into live iframe without full reload

**Non-Goals:**
- Multi-component batch regeneration (out of scope for this change)
- Undo/redo history (existing version system provides rollback)
- Regenerating components that have no bridge-id (e.g. static text nodes)
- Changing the component's bridge-id during regeneration

## Decisions

### 1. HTML extraction: `node-html-parser`, not a full DOM

**Decision**: Use `node-html-parser` (lightweight, fast, no jsdom overhead) to parse the prototype HTML, find the element with `data-bridge-id="<id>"`, extract its `outerHTML`, and after AI returns the new HTML, replace that outerHTML in the string.

**Why**: jsdom is heavy (~10MB). node-html-parser is already suitable for this structural manipulation. The replacement is a simple `fullHtml.replace(originalOuterHtml, newComponentHtml)` — safe because bridge IDs are unique.

**Alternative considered**: String regex replace — fragile, rejected.

### 2. AI prompt: "component surgeon" mode

**Decision**: The system prompt for component regeneration explicitly tells the AI:
- You are given an existing component's HTML
- Return ONLY the updated component HTML (same root element, same bridge-id)
- Do NOT return full page, DOCTYPE, head, body
- Preserve the bridge-id attribute on the root element
- Apply the design spec analysis and design profile context

**Why**: Without these constraints the AI tends to return a full page or change the surrounding structure.

### 3. Client flow: Regenerate button in annotation popup

**Decision**: In annotation mode, the annotation popup (shown when clicking an annotated element) gains a "Regenerate" button. Clicking it opens an inline text input for the instruction. On submit, fires the API call and streams the result. On completion, sends `swap-component` to the iframe.

**Why**: Annotation mode already provides the annotation popup with bridge-id context. Reusing it avoids building a separate UI entry point.

### 4. Streaming: same SSE pattern as full generation

**Decision**: `POST /regenerate-component` uses SSE streaming — sends `{ content }` chunks during generation, then `{ done: true, html: <new-component-html>, bridgeId: <id> }` at the end.

**Why**: Consistent with existing chat endpoint. Allows showing a spinner while generation is in progress.

### 5. Version management: save new prototype version after swap

**Decision**: After component swap, save a new `prototype_versions` row (increment version, set `is_current = 1`, copy full HTML with replacement applied).

**Why**: Maintains the existing version history contract. Users can roll back via version selector if needed.

## Risks / Trade-offs

- **bridge-id collision in replacement**: If the AI accidentally returns HTML with a different root element that doesn't contain the original bridge-id, the replacement will fail silently → Mitigation: validate that returned HTML contains the original bridge-id; if not, re-attach it before replacing.
- **node-html-parser parse failures on malformed HTML**: Some AI-generated HTML may be slightly malformed → Mitigation: catch parse errors, return 422 with clear error message.
- **Component context loss**: AI only sees the component, not its neighbours → Mitigation: include 200 chars of surrounding HTML context (before/after the component) in the prompt.
