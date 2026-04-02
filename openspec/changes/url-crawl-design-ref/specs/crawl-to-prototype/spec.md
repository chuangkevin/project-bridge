## ADDED Requirements

### Requirement: API endpoint accepts a URL and returns cleaned prototype HTML

A new endpoint `POST /api/projects/:id/crawl-url` SHALL accept a JSON body `{ url: string, pageId?: string }`, invoke the URL crawl engine, and save the resulting cleaned HTML as a new prototype version. The response SHALL include `{ success: true, html: string, versionId: number }`. If `pageId` is not specified, the prototype is saved to the project's default (first) page.

#### Scenario: Successful crawl and save
- **GIVEN** a valid project ID and a publicly accessible URL
- **WHEN** `POST /api/projects/:id/crawl-url` is called with `{ url: "https://example.com" }`
- **THEN** the server crawls the URL using the crawl engine
- **AND** saves the cleaned HTML as a new prototype version
- **AND** returns `{ success: true, html: "...", versionId: N }`

#### Scenario: Crawl with specific pageId
- **GIVEN** a project with multiple pages and a valid `pageId`
- **WHEN** `POST /api/projects/:id/crawl-url` is called with `{ url: "https://example.com", pageId: "page-2" }`
- **THEN** the crawled HTML is saved as a prototype version for the specified page
- **AND** other pages' prototypes are unaffected

#### Scenario: Invalid URL
- **GIVEN** a URL that fails validation (private IP, non-HTTP scheme, too long)
- **WHEN** `POST /api/projects/:id/crawl-url` is called
- **THEN** the server returns HTTP 400 with `{ error: "Invalid URL: ..." }`
- **AND** no browser is launched

#### Scenario: Crawl failure
- **GIVEN** a URL that is unreachable or blocked by bot protection
- **WHEN** `POST /api/projects/:id/crawl-url` is called
- **THEN** the server returns HTTP 502 with `{ error: "Crawl failed: ..." }`

#### Scenario: Project not found
- **GIVEN** a non-existent project ID
- **WHEN** `POST /api/projects/:id/crawl-url` is called
- **THEN** the server returns HTTP 404

### Requirement: URL input field in DesignPanel

The `DesignPanel` component SHALL include a collapsible section titled "Import from URL" (匯入網頁) with a text input for the URL and a crawl button. The section SHALL show loading state during crawl and display success/error feedback.

#### Scenario: User enters URL and triggers crawl
- **WHEN** the user types a URL into the input field and clicks the crawl button
- **THEN** the button shows a loading spinner with text "crawling..."
- **AND** the input field is disabled during the operation
- **AND** after successful crawl, a success toast appears and the preview refreshes with the crawled HTML

#### Scenario: Crawl error displayed
- **WHEN** the crawl fails (network error, bot protection, invalid URL)
- **THEN** an error message is displayed inline below the URL input
- **AND** the loading spinner stops
- **AND** the user can edit the URL and retry

#### Scenario: Empty URL submission prevented
- **WHEN** the user clicks the crawl button with an empty URL input
- **THEN** the button is disabled (no action)
- **AND** input shows a validation hint

### Requirement: Crawled HTML is saved as a prototype version

The crawled and cleaned HTML SHALL be saved using the existing prototype versioning system. The version SHALL be tagged with metadata indicating it was imported from a URL (source URL stored). The preview iframe SHALL update to show the new prototype version.

#### Scenario: Prototype version created from crawl
- **GIVEN** a successful crawl returning cleaned HTML
- **WHEN** the prototype is saved
- **THEN** a new version is created in the prototypes table
- **AND** the version metadata includes `{ source: "url-crawl", sourceUrl: "https://..." }`
- **AND** the version appears in the version history panel

#### Scenario: Existing prototype is not overwritten
- **GIVEN** a project page that already has prototype versions
- **WHEN** a URL crawl is saved
- **THEN** a new version is added (not replacing existing versions)
- **AND** the user can switch back to previous versions using the version history

### Requirement: Preview iframe displays crawled HTML with working assets

The crawled HTML displayed in the preview iframe SHALL render with external assets (images, fonts, stylesheets) loading from their absolute URLs on the original domain. The element-select overlay SHALL work on elements with the injected `data-bridge-id` attributes.

#### Scenario: Images and styles load from original domain
- **GIVEN** crawled HTML with absolute URLs pointing to `https://example.com/...`
- **WHEN** the HTML is displayed in the preview iframe
- **THEN** images, fonts, and CSS stylesheets load from the original domain
- **AND** the page renders visually similar to the original website

#### Scenario: Element selection works on crawled HTML
- **GIVEN** crawled HTML with injected `data-bridge-id` attributes
- **WHEN** the user enables element-select mode and clicks on an element
- **THEN** the selection overlay highlights the clicked element
- **AND** the micro-adjust panel opens with the selected element's bridge-id

## MODIFIED Requirements

### Requirement: DesignPanel layout extended with URL import section

The existing `DesignPanel` component layout SHALL be modified to include a new collapsible section for URL import, positioned after the reference images section and before the shell HTML section. The section is collapsed by default.

#### Scenario: URL import section visibility
- **WHEN** the DesignPanel renders
- **THEN** the "Import from URL" section header is visible
- **AND** the section is collapsed by default (input field hidden)
- **AND** clicking the header toggles the section open/closed
