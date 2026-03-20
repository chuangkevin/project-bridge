## Why

Generated prototypes frequently have broken navigation: `showPage('X')` calls that reference non-existent page divs, orphan pages unreachable from any other page, and dead-end pages with no way out. The existing `prototypeValidator.ts` checks whether `showPage` function exists and whether navigation flow calls match analysis expectations, but it does not perform structural graph analysis on the actual generated HTML. Users discover these issues only when clicking through the prototype, wasting time on manual QA.

## What Changes

- Add a `validateNavigation()` function to `prototypeValidator.ts` that parses all `showPage('X')` calls and `data-page="X"` attributes from generated HTML
- Build a directed navigation graph from the parsed data
- Detect: missing targets (showPage calls with no matching data-page), orphan pages (unreachable from any other page), dead-end pages (no outgoing navigation except implicit back), and tab/dropdown state mismatches (state targets with no matching page)
- Return navigation-specific validation results alongside existing quality checks
- Display navigation warnings in the client UI as a badge/panel on the prototype preview

## Capabilities

### New Capabilities
- `navigation-validation`: Server-side navigation graph analysis of generated prototypes with client-side warning display

### Modified Capabilities
_None -- existing validation checks remain unchanged; navigation validation is additive._

## Impact

- **Server**: Extended `prototypeValidator.ts` with new `validateNavigation()` function; integrated into the post-generation validation pipeline in `chat.ts`
- **Client**: New navigation warning badge/panel in prototype preview area
- **Dependencies**: None new -- pure string parsing and graph traversal
