## Context

Currently every chat message in the generation path (intents `full-page`, `in-shell`, `component`) triggers a full AI generation pipeline. Even trivial requests like "make the button bigger" or "change header color to blue" cause the entire prototype to be regenerated from scratch. This is slow (10-30s), expensive (full Gemini token usage), and destructive (wipes manual edits, drag adjustments, API bindings). The intent classifier (`intentClassifier.ts`) has four intents: `full-page`, `in-shell`, `component`, `question`. All non-question intents trigger full generation through `chat.ts`. There is no lightweight edit path.

The `ChatPanel.tsx` input area has a single send button. There is an existing hover-based "重新生成" action on message bubbles, but it only re-populates the input field — it does not trigger a dedicated regeneration flow.

## Goals / Non-Goals

**Goals:**
- Chat messages sent after a prototype exists should produce small, targeted CSS/HTML patches (micro-adjust) by default, not full regeneration
- Add a new `micro-adjust` intent type to the classifier that detects style/layout tweaks
- Add an explicit "重新生成" (Regenerate) button in the ChatPanel toolbar that triggers full regeneration with full context loading
- The micro-adjust flow sends only current prototype HTML + user instruction to AI, receiving a minimal patch back
- The regenerate button re-reads all project context (design specs, uploaded files, design profile, shell, tokens) before generating

**Non-Goals:**
- Changing the existing `question`, `full-page`, `in-shell`, or `component` intents
- Implementing a visual diff preview of micro-adjust patches
- Supporting multi-file or multi-page partial regeneration
- Modifying the parallel generation pipeline
- DB schema changes (micro-adjust results stored as regular prototype versions)

## Decisions

### Decision 1: New `micro-adjust` intent type in the classifier

**Choice**: Extend `Intent` union to `'full-page' | 'in-shell' | 'component' | 'question' | 'micro-adjust'`. The classifier prompt gains a fifth intent with keywords for style/layout tweaks (e.g. "變大", "change color", "add padding", "字體", "間距", "背景色").

**Rationale**: The classifier is the routing layer in `chat.ts`. Adding a new intent is the cleanest way to branch into the micro-adjust flow without disrupting existing generation paths. The AI classifier already handles Chinese + English keywords well.

**Alternative considered**: Using a boolean `isMicroAdjust` flag based on prototype existence — rejected because some messages after prototype exists should still trigger full generation (e.g. "redesign the whole page").

### Decision 2: Micro-adjust flow sends current HTML + instruction only

**Choice**: When intent is `micro-adjust`, the server loads the current prototype HTML from `prototype_versions`, sends it with a dedicated micro-adjust system prompt to Gemini, and instructs the AI to return only the modified HTML (full document but with minimal changes). The response replaces the current prototype version.

**Rationale**: Sending only the current HTML + instruction (no design specs, no architecture block, no convention injection) keeps the request small and fast. The AI only needs to know what exists and what to change. The micro-adjust prompt explicitly tells the AI: "Return the complete HTML with only the requested changes applied. Do NOT restructure, do NOT change unrelated styles."

**Alternative considered**: Having the AI return a CSS/JS patch diff — rejected because applying diffs is fragile, and returning the full (minimally-changed) HTML is simpler and more reliable.

### Decision 3: Explicit Regenerate button in ChatPanel

**Choice**: Add a "重新生成" button next to the send button in the `inputArea` of ChatPanel. It is only visible/enabled when a prototype already exists for the project. Clicking it sends a request to `POST /api/projects/:id/chat` with an extra field `forceRegenerate: true`, which forces the server to use the full generation path (ignoring micro-adjust classification) and re-reads all project context.

**Rationale**: Users need a clear, intentional way to trigger full regeneration. A dedicated button is more discoverable than typing "重新生成" in chat. The `forceRegenerate` flag keeps the API simple — one endpoint, one flag to override the default micro-adjust behavior.

**Alternative considered**: Separate API endpoint for regeneration — rejected to avoid duplicating the generation logic in chat.ts.

### Decision 4: Default intent changes when prototype exists

**Choice**: In `chat.ts`, after intent classification, if a current prototype exists AND the classified intent is `full-page` or `in-shell`, AND `forceRegenerate` is not set, the intent is overridden to `micro-adjust`. The fast-path `isObviousGenerate` regex shortcuts are also gated — they only fire when no prototype exists or `forceRegenerate` is true.

**Rationale**: This ensures that after initial generation, chat messages default to micro-adjust without requiring the classifier to be perfectly accurate. The classifier still helps — if it returns `question` or `component`, those intents are preserved. Only generation-type intents get downgraded to micro-adjust.

**Alternative considered**: Relying solely on the classifier to return `micro-adjust` — rejected because the existing `isObviousGenerate` regex would bypass the classifier entirely, still triggering full generation.

## Risks / Trade-offs

- **[Risk] Micro-adjust may produce broken HTML**: The AI returns full HTML with changes, but might accidentally break structure. Mitigation: the existing `sanitizeGeneratedHtml` runs on micro-adjust output too, catching common issues.
- **[Risk] Users may not notice the Regenerate button**: Mitigation: when the prototype exists, the send button tooltip changes to "微調" and the regenerate button is visually prominent with a distinct color.
- **[Risk] Micro-adjust prompt may cause AI to rewrite too much**: Mitigation: the system prompt explicitly says "change ONLY what the user requested, preserve everything else exactly." Include a line count warning if output differs significantly from input.
- **[Trade-off] Full HTML return vs. diff patches**: Returning full HTML is simpler but uses more tokens than a diff. Acceptable because micro-adjust requests are fast (small prompt context) and the HTML is already in memory.

## Open Questions

- Should micro-adjust have a token limit lower than the full generation's 65536? (Probably yes — 32768 should suffice for returning modified HTML)
- Should there be a visual indicator in the preview iframe showing which parts changed? (Out of scope for this change)
