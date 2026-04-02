## 1. Remove Regex Overrides (trust-ai-classifier)

- [ ] 1.1 In `chat.ts` — delete `hasGenerateKeywords`, `hasModificationKeywords`, `hasTypeKeywords`, `isObviousGenerate`, `gatedObviousGenerate` regex declarations (lines 263-278)
- [ ] 1.2 In `chat.ts` — delete `isPageRequest` regex and its override block (lines 313, 336-337)
- [ ] 1.3 In `chat.ts` — delete `hasDesignIntent` regex and the component→full-page override (lines 317-321)
- [ ] 1.4 In `chat.ts` — delete `hasActionKeywords` regex and the question→full-page upgrade block (lines 326-333)
- [ ] 1.5 In `chat.ts` — delete the final if/else chain that overrides classifier with `hasModificationKeywords` / `isObviousGenerate` (lines 338-348)
- [ ] 1.6 In `chat.ts` — simplify intent routing to: `effectiveChatOnly` → `targetBridgeId` → `effectiveForceRegenerate` → `classifyIntent()`
- [ ] 1.7 Keep `impliedForceRegenerate` regex (重新設計/重做) — this is user-explicit, not a keyword override

## 2. Improve AI Classifier (trust-ai-classifier)

- [ ] 2.1 In `intentClassifier.ts` — review and update prompt to handle cases previously covered by regex: page requests, file+design combos, action keyword upgrades
- [ ] 2.2 Add to classifier prompt: "When image is attached and user references a specific element to modify, classify as micro-adjust (not full-page)"
- [ ] 2.3 Add to classifier prompt: "When user asks to add a NEW page (加一個XX頁, 缺少XX頁), classify as full-page or in-shell, not micro-adjust"

## 3. Element Index Extraction (smart-element-targeting)

- [ ] 3.1 In `elementMatcher.ts` — add `extractElementIndex(html: string)` function that returns `{ bridgeId, tagName, textSnippet, page }[]` for all data-bridge-id elements
- [ ] 3.2 Text snippet: extract first 50 chars of text content (strip HTML tags)
- [ ] 3.3 Page detection: find closest ancestor `data-page` attribute value
- [ ] 3.4 Unit test: `extractElementIndex` on multi-page prototype returns correct entries

## 4. Two-Pass Vision Prompts (smart-element-targeting)

- [ ] 4.1 Create `packages/server/src/prompts/vision-element-identify.txt` — prompt for element identification pass (input: message + image + element index, output: JSON with bridgeId)
- [ ] 4.2 Create `packages/server/src/prompts/vision-element-modify.txt` — prompt for element modification pass (input: message + image + element HTML, output: JSON with modifiedHtml)

## 5. Two-Pass Vision Flow (smart-element-targeting)

- [ ] 5.1 In `chat.ts` vision-micro-adjust section — replace single-pass flow with two-pass: call identification first, then modification
- [ ] 5.2 Pass 1: build element index via `extractElementIndex`, send to AI with image + message, parse JSON response for `{ page, bridgeId, elementDescription, reasoning }`
- [ ] 5.3 Validate Pass 1 result: check bridgeId exists via `findElementByBridgeId`, try `fuzzyMatchElement` on failure
- [ ] 5.4 Pass 2: extract target element outerHTML, send to AI with image + message, parse JSON response for `{ modifiedHtml, reasoning }`
- [ ] 5.5 Replace element via `replaceElementByBridgeId`, run sanitize + autoFix + convention injection, save as new version
- [ ] 5.6 Fallback: if Pass 1 fails to identify valid element, fall back to existing full-HTML vision-micro-adjust path

## 6. Testing

- [ ] 6.1 Unit test: `extractElementIndex` returns correct index for multi-page prototype
- [ ] 6.2 Unit test: intent routing with regex removed — verify `classifyIntent` is called (not skipped by regex)
- [ ] 6.3 Integration test: mock two-pass vision flow — Pass 1 identifies element, Pass 2 modifies it, prototype updated
- [ ] 6.4 Playwright E2E: paste screenshot + type "列表的搜尋要用這個樣式" → only search element modified, rest of page unchanged
