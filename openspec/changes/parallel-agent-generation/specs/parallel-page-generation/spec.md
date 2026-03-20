## ADDED Requirements

### Requirement: Master agent plans page assignments from analysis result
The system SHALL use a Master Agent (single Gemini call) to read the project's analysis_result and design_tokens, then produce a generation plan: shared shell structure, shared CSS, and per-page assignment objects.

#### Scenario: Spec with 3 pages and design tokens
- **WHEN** analysis_result contains 3 pages (選擇範本, 選擇物件, 選擇額度) and design_tokens exist
- **THEN** Master Agent returns JSON with: shell definition (nav type, nav items), sharedCss (using design token CSS variables), and 3 page assignments each containing page-specific spec, constraints, and navigation rules

#### Scenario: Spec with 1-2 pages
- **WHEN** analysis_result contains 1 or 2 pages
- **THEN** system bypasses master/sub-agent pipeline and uses current single-call generation for efficiency

### Requirement: Sub-agents generate page fragments in parallel
The system SHALL spawn one Gemini call per page, running concurrently via Promise.all. Each sub-agent receives: design tokens as CSS variables, shared CSS, and its page-specific spec only.

#### Scenario: 3 pages generated in parallel
- **WHEN** Master produces 3 page assignments
- **THEN** system fires 3 Gemini calls simultaneously, each using a different API key, and waits for all to complete

#### Scenario: One sub-agent fails, others succeed
- **WHEN** sub-agent for "選擇額度" fails (API error or timeout) but the other 2 succeed
- **THEN** system retries the failed page once with a different API key
- **AND** if retry also fails, returns partial result with error indicator for the failed page

### Requirement: Sub-agent output is a page fragment
Each sub-agent SHALL return only a `<div class="page" id="page-{name}" data-page="{name}">...</div>` fragment with page-scoped styles using a `.page-{name}` class prefix. Sub-agents SHALL NOT return `<!DOCTYPE>`, `<html>`, or `<head>` tags.

#### Scenario: Sub-agent returns valid fragment
- **WHEN** sub-agent generates the "選擇範本" page
- **THEN** output is a single `<div class="page" id="page-選擇範本">` containing all page content and a `<style>` block scoped with `.page-選擇範本` prefix

#### Scenario: Sub-agent accidentally returns full HTML
- **WHEN** sub-agent returns `<!DOCTYPE html><html>...`
- **THEN** assembler extracts the page content from `<body>` and wraps it in the expected fragment format

### Requirement: HTML Assembler merges fragments into complete prototype
The system SHALL combine all page fragments into a single HTML document with: shared CSS variables from design tokens, shared CSS from Master, showPage() navigation function, and proper page visibility toggling.

#### Scenario: Successful assembly of 3 pages
- **WHEN** 3 page fragments are returned successfully
- **THEN** assembler produces a complete `<!DOCTYPE html>` document with all pages, unified `:root` CSS variables, showPage() function, and DOMContentLoaded initialization showing the first page

#### Scenario: Duplicate CSS properties across fragments
- **WHEN** multiple fragments define the same CSS property (e.g., `body { font-family: ... }`)
- **THEN** assembler deduplicates by extracting common properties into the shared `<style>` block

### Requirement: Assign different API keys to parallel calls
The system SHALL use a different Gemini API key for each concurrent sub-agent call to maximize throughput and avoid per-key rate limits.

#### Scenario: 4 keys available, 3 pages to generate
- **WHEN** 3 sub-agents run in parallel with 4 available keys
- **THEN** each sub-agent uses a different key (key rotation with exclusion)

#### Scenario: More pages than keys
- **WHEN** 6 pages need generation but only 4 keys available
- **THEN** system runs first 4 in parallel, then remaining 2 in a second batch
