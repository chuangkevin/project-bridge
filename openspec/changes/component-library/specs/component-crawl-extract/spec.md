## ADDED Requirements

### Requirement: Extract UI components from crawled websites
The system SHALL extend the existing website crawler to identify and extract reusable UI components from crawled pages.

#### Scenario: Crawl and extract components
- **WHEN** user calls `POST /api/components/crawl-extract` with `{ url: "https://example.com", categories: ["navigation", "card", "button"] }`
- **THEN** system opens the URL in Playwright
- **AND** identifies DOM elements matching the requested categories using semantic selectors:
  - navigation: `nav`, `[role="navigation"]`, `.navbar`, `.sidebar`, `header nav`
  - card: `.card`, `[class*="card"]`, `article`, `.listing-item`, `.tile`
  - button: `button`, `.btn`, `[role="button"]`, `a.btn`
  - form: `form`, `.form-group`, `.search-bar`
  - hero: `.hero`, `.banner`, `.jumbotron`, `section:first-of-type` (if large)
  - footer: `footer`, `[role="contentinfo"]`
  - modal: `.modal`, `[role="dialog"]`
  - table: `table`, `.data-grid`, `[role="grid"]`
- **AND** for each matched element, extracts outerHTML + computed CSS
- **AND** generates a thumbnail for each extracted component
- **AND** returns the list of extracted components (not yet saved)

#### Scenario: Save extracted components
- **WHEN** user reviews the extracted components and confirms selection
- **THEN** system saves selected components to the `components` table with `source_url` set to the crawled URL

#### Scenario: Deduplicate similar components
- **WHEN** multiple elements on the page match the same category (e.g., 5 cards)
- **THEN** system groups structurally similar elements and keeps only the most representative one per group
- **AND** similarity is determined by HTML tag structure (ignoring text content and image sources)

#### Scenario: Batch crawl multiple URLs
- **WHEN** user provides multiple URLs for crawl extraction
- **THEN** system crawls each URL sequentially
- **AND** deduplicates extracted components across all URLs
- **AND** returns a merged list of unique components
