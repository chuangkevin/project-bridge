## Why

Every prototype generation today replaces the entire page HTML. When a user uploads a design spec (e.g. 5168 生活圈頻道 PDF) and wants the card layout to match, they have to describe the entire page again and hope the regeneration respects the change. There is no way to say "just fix this card — keep everything else". This makes iterative, spec-driven refinement impractical.

## What Changes

- Annotation mode gains a **"Regenerate"** action on any annotated element
- A new `POST /api/projects/:id/prototype/regenerate-component` endpoint:
  - Accepts `bridgeId` + `instruction` (and optional `designPageHint`)
  - Extracts the target component's outer HTML from the current prototype
  - Sends it to AI with the instruction, design spec analysis, and design profile
  - AI returns only the updated component HTML (no full page)
  - Server replaces the component in the full prototype HTML and saves a new version
- Bridge script gains a `swap-component` message: injects new component HTML into the live iframe without full reload
- UI: in annotation mode, each annotation popup shows a **Regenerate** button that opens an inline instruction input

## Capabilities

### New Capabilities
- `component-regeneration`: Target an individual component by bridge-id, send a natural-language instruction, receive updated component HTML merged back into the prototype — without regenerating the full page

### Modified Capabilities
- (none — annotation system and prototype storage are extended, not spec-level replaced)

## Impact

- **packages/server**: new route `regenerate-component`; HTML component extraction/replacement utility
- **packages/client**: AnnotationEditor (or annotation popup) gains Regenerate button + instruction input; bridge script gains `swap-component` message handler
- **AI prompt**: new focused prompt for single-component regeneration (provide surrounding context, design spec, and component HTML)
