## MODIFIED Requirements

### Requirement: Vision micro-adjust uses two-pass element targeting

When `intent === 'micro-adjust'` AND an image is attached AND a prototype exists, the system SHALL use a two-pass flow instead of sending the entire prototype HTML to the AI.

**Pass 1 — Element Identification:**
- The system extracts a lightweight element index from the prototype: each element's `data-bridge-id`, tag name, text snippet (first 50 chars), and `data-page` attribute
- The AI receives: user message + screenshot image + element index
- The AI returns JSON: `{ page: string, bridgeId: string, elementDescription: string, reasoning: string }`

**Pass 2 — Element Modification:**
- The system extracts the target element's outerHTML using `findElementByBridgeId`
- The AI receives: user message + screenshot image + target element outerHTML only
- The AI returns JSON: `{ modifiedHtml: string, reasoning: string }`
- The system replaces the element in the full prototype using `replaceElementByBridgeId`

#### Scenario: User references a specific area with screenshot
- **GIVEN** prototype has pages: "首頁", "列表" with elements including `data-bridge-id="search-bar-1"` on the "列表" page
- **WHEN** user pastes a screenshot and says "列表的搜尋要用這個樣式"
- **THEN** Pass 1 identifies `{ page: "列表", bridgeId: "search-bar-1", elementDescription: "search input area" }`
- **AND** Pass 2 receives only the `search-bar-1` element HTML (~500 chars, not 20K)
- **AND** Pass 2 modifies only that element to match the screenshot style
- **AND** the modified element replaces the original in the prototype

#### Scenario: User says "把 header 的 logo 換成這個"
- **GIVEN** prototype has element `data-bridge-id="header-logo-1"`
- **WHEN** user pastes a logo image and says "把 header 的 logo 換成這個"
- **THEN** Pass 1 identifies `{ bridgeId: "header-logo-1" }`
- **AND** Pass 2 modifies only the header logo element

#### Scenario: User gives vague reference
- **GIVEN** prototype has multiple card elements
- **WHEN** user pastes a screenshot and says "用這個風格"
- **THEN** Pass 1 uses the screenshot + element index to pick the most relevant element
- **AND** if no specific element matches, Pass 1 returns the top-level page container

### Requirement: Element index extraction

The system SHALL provide an `extractElementIndex` function that scans prototype HTML and returns a compact array of element metadata for each `data-bridge-id` element:

```typescript
type ElementIndexEntry = {
  bridgeId: string;
  tagName: string;
  textSnippet: string;  // first 50 chars of text content
  page: string | null;  // from closest ancestor data-page attribute
};
```

#### Scenario: Multi-page prototype
- **GIVEN** prototype HTML contains two pages with 15 bridge-id elements each
- **WHEN** `extractElementIndex` is called
- **THEN** returns 30 entries, each with bridgeId, tagName, textSnippet, and page
- **AND** total serialized size is under 5K chars

#### Scenario: Nested elements
- **GIVEN** a card element contains child elements with their own bridge-ids
- **WHEN** `extractElementIndex` is called
- **THEN** both parent and child elements appear in the index with their own entries

### Requirement: Identification prompt produces accurate targeting

The element identification prompt SHALL instruct the AI to:
1. Read the user message to understand WHAT they want to change and WHERE
2. Read the screenshot to understand the target visual style
3. Match the user's description against the element index to find the best `bridgeId`
4. Return a single JSON object with the identified target

#### Scenario: Chinese element reference matching
- **GIVEN** element index contains `{ bridgeId: "search-input-1", tagName: "input", textSnippet: "搜尋商品...", page: "列表" }`
- **WHEN** user says "搜尋的輸入框要改成這樣" with a screenshot
- **THEN** AI identifies `bridgeId: "search-input-1"` by matching "搜尋" + "輸入框" to the element

#### Scenario: Page-level reference
- **GIVEN** user says "列表頁的搜尋" and element index has entries on the "列表" page
- **THEN** AI filters to "列表" page elements first, then matches "搜尋" within that page

### Requirement: Modification prompt uses only target element HTML

The element modification prompt SHALL:
1. Receive only the target element's outerHTML (not the full prototype)
2. Receive the screenshot as visual design reference
3. Return the modified element HTML that matches the screenshot's style while preserving the element's `data-bridge-id` and structural role
4. Preserve all existing `data-bridge-id` attributes on child elements

#### Scenario: Style-only change from screenshot
- **GIVEN** target element is `<div data-bridge-id="search-bar-1" class="flex gap-2"><input class="border p-2" placeholder="搜尋"/><button class="bg-blue-500">搜</button></div>`
- **WHEN** screenshot shows a rounded search bar with icon inside
- **THEN** AI modifies the HTML to add rounded corners, icon, updated layout
- **AND** `data-bridge-id="search-bar-1"` is preserved

#### Scenario: Token savings
- **GIVEN** full prototype HTML is 29K chars, target element is 800 chars
- **WHEN** Pass 2 runs
- **THEN** AI input context is ~1500 chars (prompt + element + message), not 20K+

### Requirement: Fallback to full-HTML micro-adjust

If Pass 1 fails to identify a valid `bridgeId` (returns null, or the returned bridgeId does not exist in prototype even after fuzzy matching), the system SHALL fall back to the existing full-HTML vision micro-adjust path.

#### Scenario: Identification returns unknown bridgeId
- **GIVEN** Pass 1 returns `{ bridgeId: "nonexistent-element" }`
- **AND** `findElementByBridgeId` returns not found
- **AND** `fuzzyMatchElement` also returns null
- **THEN** system falls back to the existing full-HTML vision micro-adjust flow

#### Scenario: Identification returns null
- **GIVEN** Pass 1 returns `{ bridgeId: null }`
- **THEN** system falls back to the existing full-HTML vision micro-adjust flow

### Requirement: Modified element saved as new version

After successful element replacement, the system SHALL:
1. Run `sanitizeGeneratedHtml` on the full updated HTML
2. Run `autoFixDesignViolations`
3. Inject convention colors if `designConvention` exists
4. Save as a new prototype version with incremented version number
5. Return the updated HTML via SSE with `done: true`

#### Scenario: Successful save
- **WHEN** Pass 2 returns valid modified HTML and replacement succeeds
- **THEN** a new prototype version is created with `is_current = 1`
- **AND** previous version has `is_current = 0`
- **AND** SSE sends `{ done: true, html: updatedHtml, messageType: 'micro-adjust' }`

## ADDED Requirements

### Requirement: New prompts for two-pass flow

Two new prompt files SHALL be created:

1. `packages/server/src/prompts/vision-element-identify.txt` — System prompt for Pass 1 (element identification)
2. `packages/server/src/prompts/vision-element-modify.txt` — System prompt for Pass 2 (element modification)

The existing `vision-micro-adjust.txt` is kept as the fallback prompt.

#### Scenario: Prompt files exist and are used
- **WHEN** vision micro-adjust with two-pass flow is triggered
- **THEN** Pass 1 uses `vision-element-identify.txt` as system instruction
- **AND** Pass 2 uses `vision-element-modify.txt` as system instruction
