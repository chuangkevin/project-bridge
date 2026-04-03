## ADDED Requirements

### Requirement: Crawl website and extract computed CSS styles
The system SHALL accept a URL, open it in Playwright, and extract computed styles from DOM elements grouped by semantic category (headings, body text, buttons, inputs, cards, navigation).

#### Scenario: Successful crawl of a public website
- **WHEN** user provides a valid public URL (e.g., `https://house.example.com`)
- **THEN** system returns a structured JSON containing: typography (font-family, font-size, font-weight, line-height per element type), color palette (top 10 most-used colors), spacing patterns, border-radius values, and shadow values

#### Scenario: Website blocks headless browser or times out
- **WHEN** the target URL fails to load within 15 seconds or returns a blocking response
- **THEN** system returns an error result with `{ success: false, error: "timeout" | "blocked" }` and does not crash

#### Scenario: Website requires authentication
- **WHEN** the target URL redirects to a login page
- **THEN** system detects the redirect, returns `{ success: false, error: "auth_required" }`, and suggests using a screenshot instead

### Requirement: Extract color palette from visible elements
The system SHALL collect all `color`, `background-color`, and `border-color` values from visible elements, deduplicate them, and return the top 10 by frequency.

#### Scenario: Website uses CSS variables for theming
- **WHEN** the website uses `var(--primary-color)` in stylesheets
- **THEN** system extracts the resolved computed value (e.g., `#8E6FA7`), not the variable reference

### Requirement: Extract typography hierarchy
The system SHALL extract font-family, font-size, font-weight, and line-height for h1-h6, p, span, button, and input elements.

#### Scenario: Multiple font families on page
- **WHEN** the page uses different fonts for headings vs body
- **THEN** system reports both, with the heading font under `typography.heading.fontFamily` and body font under `typography.body.fontFamily`

### Requirement: Server-side API endpoint for crawling
The system SHALL expose `POST /api/projects/:projectId/crawl-website` accepting `{ url: string }` and returning the extracted style data.

#### Scenario: API call with valid URL
- **WHEN** client sends `POST /api/projects/abc/crawl-website` with `{ "url": "https://example.com" }`
- **THEN** server returns `{ success: true, styles: { ... }, screenshot: "base64..." }`

#### Scenario: API call with invalid URL
- **WHEN** client sends a malformed URL
- **THEN** server returns 400 with `{ error: "Invalid URL" }`
