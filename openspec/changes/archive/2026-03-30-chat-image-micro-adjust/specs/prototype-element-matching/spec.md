## ADDED Requirements

### Requirement: Fuzzy element matching when bridge-id is not found

When the Gemini Vision API returns a `bridgeId` that does not exist in the current prototype HTML, the system SHALL attempt a fuzzy match. The fuzzy matcher SHALL:
1. Parse the AI's `reasoning` field for element type and text content hints
2. Scan all `data-bridge-id` elements in the prototype
3. Score candidates by element tag match, text content similarity, and CSS class overlap
4. Select the highest-scoring candidate if its score exceeds 0.5

#### Scenario: Exact bridge-id match found
- **WHEN** the AI returns a `bridgeId` that exists in the prototype
- **THEN** the system uses that element directly for replacement
- **AND** no fuzzy matching is performed

#### Scenario: Fuzzy match recovers from hallucinated bridge-id
- **WHEN** the AI returns a `bridgeId` that does not exist in the prototype
- **AND** the fuzzy matcher finds a candidate with score > 0.5
- **THEN** the system uses the fuzzy-matched element's bridge-id for replacement
- **AND** the replacement HTML has its `data-bridge-id` updated to match the actual element

#### Scenario: No match found at all
- **WHEN** the AI returns a non-existent `bridgeId`
- **AND** no fuzzy match candidate scores above 0.5
- **THEN** the system falls back to the standard text-only micro-adjust flow (full-page regeneration with the micro-adjust prompt)
- **AND** the user receives the result as a normal micro-adjust response

### Requirement: Element matching utility function

A new utility `packages/server/src/services/elementMatcher.ts` SHALL export:
- `findElementByBridgeId(html: string, bridgeId: string): { found: boolean; outerHtml?: string }` — exact lookup
- `fuzzyMatchElement(html: string, reasoning: string, elementHints: { tag?: string; textContent?: string; classes?: string[] }): { bridgeId: string; score: number; outerHtml: string } | null` — fuzzy fallback

#### Scenario: fuzzyMatchElement returns best candidate
- **WHEN** called with reasoning "the search input field with placeholder text" and hints `{ tag: 'input', textContent: 'search' }`
- **AND** the prototype contains `<input data-bridge-id="abc" placeholder="Search...">`
- **THEN** the function returns `{ bridgeId: 'abc', score: >0.5, outerHtml: '...' }`

#### Scenario: fuzzyMatchElement returns null when no good match
- **WHEN** called with hints that don't match any element well
- **THEN** the function returns `null`

## MODIFIED Requirements

### Requirement: replaceComponent validates and falls back gracefully

The existing `replaceComponent` utility in `componentExtractor.ts` SHALL continue to work as before, but the vision-micro-adjust flow SHALL validate the bridge-id existence before calling `replaceComponent`. If the bridge-id was fuzzy-matched, the replacement HTML SHALL have its `data-bridge-id` attribute updated to the actual matched bridge-id before replacement.

#### Scenario: Fuzzy-matched replacement preserves correct bridge-id
- **WHEN** the AI suggested bridge-id "xyz" but the fuzzy matcher resolved to actual bridge-id "abc"
- **THEN** the replacement HTML has `data-bridge-id="abc"` (not "xyz")
- **AND** `replaceComponent` is called with bridge-id "abc"
