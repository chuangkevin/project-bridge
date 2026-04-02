## Why

The intent routing pipeline in `chat.ts` has ~80 lines of regex-based keyword matching that override the AI vision classifier. This causes two categories of bugs:

1. **False-positive full-page generation** — `hasGenerateKeywords` matches "設計" even in "設計稿上加個tag", triggering a full-page regeneration instead of a targeted edit. `hasActionKeywords` upgrades "question" to "full-page" for any message mentioning "列表" or "按鈕". The AI classifier (now with Gemini Vision) can distinguish these cases, but gets overridden.

2. **Whole-page rewrite on vision micro-adjust** — When a user pastes a screenshot and says "列表的搜尋要用這個樣式", the system sends the ENTIRE prototype HTML (up to 20K chars) to AI for rewrite. The AI must return a complete modified `componentHtml` for the matched `bridgeId`. This wastes tokens and risks unintended changes to surrounding elements. The system should instead: identify the target element first, extract just that element's HTML, then modify only that fragment.

## What Changes

### trust-ai-classifier
Remove all regex-based intent overrides (`hasGenerateKeywords`, `hasModificationKeywords`, `isObviousGenerate`, `isPageRequest`, `hasDesignIntent`, `hasActionKeywords`) and their associated if/else chains. The AI vision classifier becomes the sole routing decision maker. Only three explicit overrides remain:
- `effectiveChatOnly` — user explicitly toggled consultant mode
- `targetBridgeId` — user explicitly selected an element in the iframe
- `forceRegenerate` / `impliedForceRegenerate` — user explicitly clicked regenerate or said "重新設計"

### smart-element-targeting
Replace the current vision-micro-adjust flow (send full HTML, get full component back) with a two-pass approach:
1. **Element identification pass** — AI analyzes user message + screenshot + page list to return `{ page, elementDescription, bridgeId }` identifying which specific element to modify
2. **Element modification pass** — AI receives only that element's HTML + the screenshot as style reference, returns modified fragment
3. Replace the element in-place in the prototype, save as new version

## Capabilities

### New Capabilities
- `smart-element-targeting`: Two-pass vision micro-adjust — first identify target element, then modify only that element's HTML using screenshot as design reference

### Modified Capabilities
- `trust-ai-classifier`: Strip regex overrides from intent routing — AI classifier with vision is the sole decision maker

## Impact

- `packages/server/src/routes/chat.ts` — Remove ~60 lines of regex + override logic (lines 253-348), refactor vision-micro-adjust path (lines 458-544) to two-pass element targeting
- `packages/server/src/services/intentClassifier.ts` — May need prompt refinements now that it is the sole decision maker (no regex safety net)
- `packages/server/src/prompts/vision-micro-adjust.txt` — Split into two prompts: element-identify and element-modify
- `packages/server/src/services/elementMatcher.ts` — Used by new targeting flow to extract and replace elements
