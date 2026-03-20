## Context

The existing `prototypeValidator.ts` performs 6 checks: HTML completeness, bridge ID presence, page presence (name string match), page content length, showPage function existence, convention color, and navigation flow (checking specific `showPage('target')` calls from analysis). These are surface-level text checks.

The navigation validator adds structural graph analysis: parsing the actual HTML to extract all `showPage()` call sites and `data-page` targets, building a directed graph, and running reachability analysis.

## Goals / Non-Goals

**Goals:**
- Parse all `showPage('...')` and `showPage("...")` calls from HTML, associating each with its source page context
- Parse all `data-page="..."` attributes to build the set of defined pages
- Build a directed graph (page -> page) from the parsed navigation calls
- Detect missing targets, orphan pages, dead-end pages, and tab/state mismatches
- Return results in the existing `ValidationResult` format (array of checks)
- Display warnings in the client without blocking prototype usage

**Non-Goals:**
- Auto-fixing broken navigation (future enhancement)
- Validating navigation logic correctness (e.g., whether the right button goes to the right page)
- Runtime validation in the prototype iframe

## Decisions

### 1. Regex-based HTML parsing rather than DOM parser
**Rationale**: The server already uses regex for validation in `prototypeValidator.ts`. Adding a DOM parser (like cheerio) would introduce a new dependency for a focused parsing task. The patterns (`showPage('...')`, `data-page="..."`) are well-defined and regex-safe.
**Alternative**: Use cheerio/jsdom for proper DOM parsing. Deferred -- can upgrade if regex proves insufficient for edge cases.

### 2. Graph analysis uses simple BFS from first page
**Rationale**: The first `data-page` in HTML order is conventionally the landing page. BFS from this node finds all reachable pages. Any page not in the BFS result set is orphaned. Dead-ends are pages with zero outgoing edges (excluding the first page, which is a valid terminal for "back" flows).
**Alternative**: Multi-source BFS from all pages with incoming edges. Rejected as unnecessarily complex.

### 3. Navigation warnings are non-blocking
**Rationale**: Consistent with existing validator behavior ("Non-blocking: logs warnings but never prevents prototype storage"). Navigation issues are warnings, not errors. The prototype is still usable even with some broken links.

### 4. Client shows warnings as a collapsible badge in prototype preview
**Rationale**: A small badge with warning count is non-intrusive. Clicking it expands to show details. This matches the existing UI pattern for validation results.

## Risks / Trade-offs

- [Risk] Regex may miss dynamically constructed showPage calls (e.g., `showPage(variable)`) -> Mitigation: Flag dynamic calls as "unresolved navigation" rather than missing
- [Risk] Tab/dropdown states use different patterns than showPage -> Mitigation: Also parse `data-tab`, `data-state`, and common tab switching patterns
- [Risk] First data-page may not always be the landing page -> Mitigation: Also check for `showPage` calls in `DOMContentLoaded` or `window.onload` handlers to identify the actual entry point
