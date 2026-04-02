## Context

Current architecture:
- `intentClassifier.ts` — Gemini Vision AI classifies intent into: full-page / in-shell / component / question / micro-adjust. Supports image input for vision-based classification.
- `chat.ts` lines 253-348 — Six regex patterns (`hasGenerateKeywords`, `hasModificationKeywords`, `hasTypeKeywords`, `isObviousGenerate`, `isPageRequest`, `hasDesignIntent`, `hasActionKeywords`) that run BEFORE and AFTER the AI classifier, overriding its decision in most cases.
- `chat.ts` lines 458-544 — Vision micro-adjust path: when micro-adjust + image attachment, sends entire prototype HTML (truncated to 20K) to AI, expects JSON back with `{ bridgeId, reasoning, componentHtml }`. AI must identify AND modify the element in one pass.
- `elementMatcher.ts` — `findElementByBridgeId`, `replaceElementByBridgeId`, `fuzzyMatchElement` utilities.
- `vision-micro-adjust.txt` — Single prompt that handles both identification and modification.

## Goals / Non-Goals

**Goals:**
- AI classifier is the sole intent decision maker (no regex overrides)
- Vision micro-adjust modifies only the targeted element, not the full page
- Reduce token waste: send only the target element HTML to modification AI, not 20K chars
- Accurate element targeting: AI uses message + screenshot + prototype structure to find the right element

**Non-Goals:**
- Changing the AI classifier's model or prompt structure (it already works well)
- Supporting multi-element modifications in a single message
- Changing the `targetBridgeId` (explicit element select) flow — that already works correctly

## Decisions

### 1. Remove regex overrides entirely

**Choice:** Delete all six regex patterns and their if/else override chains. The intent routing becomes:

```
if (effectiveChatOnly) → 'question'
else if (targetBridgeId && currentPrototype) → 'element-adjust'
else if (effectiveForceRegenerate) → hasShell ? 'in-shell' : 'full-page'
else → await classifyIntent(message, apiKey, hasShell, intentImage)
```

**Rationale:** The AI classifier already has vision capabilities and handles nuance (e.g., "設計稿上加個tag" vs "設計一個購物網站"). The regex overrides were added as a safety net before vision was available. They now cause more harm than good.

**Risk:** The AI classifier may occasionally misroute. Mitigated by: (a) keeping `forceRegenerate` as explicit escape hatch, (b) improving classifier prompt if needed based on production data.

### 2. Two-pass vision element targeting

**Choice:** Split the single vision-micro-adjust call into two sequential AI calls:

**Pass 1 — Element Identification:**
- Input: user message + screenshot image + list of all `data-bridge-id` values with their tag names and text snippets (lightweight, ~2K chars)
- Output: JSON `{ page: string, bridgeId: string, elementDescription: string, reasoning: string }`
- Prompt: "Given the user's instruction and screenshot, identify which element in the prototype should be modified."

**Pass 2 — Element Modification:**
- Input: screenshot image + user message + target element's outerHTML only (~200-2000 chars)
- Output: JSON `{ modifiedHtml: string, reasoning: string }`
- Prompt: "Modify this HTML element to match the style/design shown in the screenshot, following the user's instruction."

**Rationale:** Sending 20K chars of full HTML in one pass wastes tokens and causes the AI to make unintended changes. Two passes with focused context produce more accurate results. The first pass is cheap (small context), and the second pass operates on a small HTML fragment.

**Alternative considered:** Single pass with full HTML but asking AI to return only the diff. Rejected because AI still needs to process 20K chars of context, and "return only the diff" instructions are unreliable.

### 3. Element index for identification pass

**Choice:** Build a lightweight element index from the prototype HTML before the identification pass:

```typescript
// Extract all bridge-id elements with metadata
const elementIndex = extractElementIndex(currentPrototype.html);
// Returns: [{ bridgeId: "search-bar-1", tagName: "div", textSnippet: "搜尋...", page: "列表" }, ...]
```

This index (~2K chars) replaces the full 20K HTML in Pass 1, giving the AI enough structural context to identify the target without processing the full page.

**Rationale:** The AI needs to know what elements exist and roughly what they contain, but doesn't need the full CSS/HTML structure for identification. A compact index is sufficient and dramatically reduces token cost.

### 4. Fallback on identification failure

**Choice:** If Pass 1 returns a `bridgeId` that doesn't exist in the prototype (or returns null), fall back to the current full-HTML micro-adjust path as a safety net.

**Rationale:** Graceful degradation. The two-pass approach is an optimization; if it fails, the existing (working) fallback still produces a correct result, just less efficiently.

## Risks / Trade-offs

- **Two API calls instead of one** — Adds ~1-2s latency. Mitigated by the fact that each call is faster (smaller context). Net latency should be similar or better.
- **Element identification may pick the wrong element** — Mitigated by fuzzy matching and fallback to full-HTML path.
- **Removing regex removes a "fast path"** — Some obvious cases (e.g., "設計一個網站" with no prototype) used to skip the AI call entirely via `isObviousGenerate`. Now every message hits the classifier. Mitigated by the intent cache in `classifyIntent` (5-min TTL).
