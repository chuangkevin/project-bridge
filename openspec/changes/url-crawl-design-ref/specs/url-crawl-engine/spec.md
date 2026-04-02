## ADDED Requirements

### Requirement: Playwright headless crawl captures fully-rendered HTML from a URL

The system SHALL launch a Playwright headless Chromium browser, navigate to the provided URL, wait for the page to finish rendering (networkidle or 30-second timeout), and return the full document HTML via `page.content()`. The browser instance SHALL be closed after each crawl to free resources.

#### Scenario: Crawl a static HTML page
- **GIVEN** a valid URL pointing to a static HTML page
- **WHEN** the crawl engine processes the URL
- **THEN** it returns the complete HTML document including all elements visible on the page
- **AND** the browser instance is closed after capture

#### Scenario: Crawl a JavaScript-rendered SPA
- **GIVEN** a valid URL pointing to a React/Vue/Angular SPA that renders content via JavaScript
- **WHEN** the crawl engine processes the URL
- **THEN** it waits for JavaScript execution and DOM rendering
- **AND** returns the final rendered HTML with all dynamically-generated content
- **AND** the result is not the empty shell HTML that a simple HTTP fetch would return

#### Scenario: Page does not reach networkidle within timeout
- **GIVEN** a URL pointing to a page that continuously loads resources (infinite scroll, real-time feeds)
- **WHEN** 30 seconds have elapsed since navigation started
- **THEN** the crawl engine captures whatever HTML has rendered so far
- **AND** returns it without error

#### Scenario: URL is unreachable or returns error
- **GIVEN** a URL that returns a 404, 500, connection refused, or DNS resolution failure
- **WHEN** the crawl engine processes the URL
- **THEN** it throws an error with a descriptive message (e.g., "Page not found", "Connection refused")
- **AND** the browser instance is closed

### Requirement: HTML cleanup removes scripts, tracking, and inline handlers

The crawled HTML SHALL be sanitized by removing all `<script>` tags, `<noscript>` tags, inline event handler attributes (`onclick`, `onload`, `onerror`, `onmouseover`, etc.), known tracking elements (analytics iframes, pixel images), and unnecessary `<link>` tags (`rel="preload"`, `rel="prefetch"`). Meta tags SHALL be preserved only for `charset` and `viewport`.

#### Scenario: Scripts are removed
- **GIVEN** crawled HTML containing `<script>` tags (inline and external)
- **WHEN** the cleanup pipeline processes the HTML
- **THEN** all `<script>` tags and their contents are removed
- **AND** all `<noscript>` tags and their contents are removed
- **AND** no JavaScript code remains in the output

#### Scenario: Inline event handlers are removed
- **GIVEN** an element with `onclick="alert('test')"` or similar inline handlers
- **WHEN** the cleanup pipeline processes the HTML
- **THEN** all `on*` attributes are removed from all elements
- **AND** the element structure and other attributes are preserved

#### Scenario: Tracking elements are removed
- **GIVEN** HTML containing analytics iframes, 1x1 tracking pixel images, or elements with known tracking-related class names
- **WHEN** the cleanup pipeline processes the HTML
- **THEN** those elements are removed from the output

### Requirement: Relative URLs are converted to absolute URLs

All relative URLs in `src`, `href`, `srcset` attributes and `url()` references in inline `style` attributes SHALL be converted to absolute URLs using the crawled page's origin as the base.

#### Scenario: Relative image src
- **GIVEN** an `<img src="/images/logo.png">` in HTML crawled from `https://example.com/about`
- **WHEN** the cleanup pipeline processes the HTML
- **THEN** the src becomes `https://example.com/images/logo.png`

#### Scenario: Relative CSS url() in inline style
- **GIVEN** a `<div style="background: url('../bg.jpg')">` crawled from `https://example.com/page/`
- **WHEN** the cleanup pipeline processes the HTML
- **THEN** the url becomes `https://example.com/bg.jpg`

#### Scenario: Already-absolute URLs are unchanged
- **GIVEN** an `<img src="https://cdn.example.com/logo.png">`
- **WHEN** the cleanup pipeline processes the HTML
- **THEN** the src remains `https://cdn.example.com/logo.png`

### Requirement: data-bridge-id injection on meaningful elements

The system SHALL walk the cleaned DOM and inject `data-bridge-id="crawl-{index}"` attributes on meaningful elements. Meaningful elements include: `h1-h6`, `p`, `a`, `button`, `img`, `input`, `textarea`, `select`, `nav`, `header`, `footer`, `section`, `article`, `main`, `aside`, `form`, `ul`, `ol`, `li`, `table`, `figure`, `blockquote`, and qualifying `div`/`span` elements. A `div` qualifies if it has direct text content, has 3 or fewer children, or has class names suggesting a component (containing `card`, `item`, `hero`, `banner`). A `span` qualifies only if it has direct text content.

#### Scenario: Headings and paragraphs get bridge-ids
- **GIVEN** cleaned HTML with `<h1>Title</h1><p>Body text</p>`
- **WHEN** bridge-id injection runs
- **THEN** output contains `<h1 data-bridge-id="crawl-0">Title</h1><p data-bridge-id="crawl-1">Body text</p>`

#### Scenario: Wrapper divs without content are skipped
- **GIVEN** a deeply nested `<div>` that contains only other `<div>` elements (more than 3 children) and no direct text
- **WHEN** bridge-id injection runs
- **THEN** that wrapper div does NOT receive a `data-bridge-id`
- **AND** its meaningful child elements still receive bridge-ids

#### Scenario: Card-like divs get bridge-ids
- **GIVEN** a `<div class="product-card">` with an image and text inside
- **WHEN** bridge-id injection runs
- **THEN** the div receives a `data-bridge-id` because its class name contains "card"

#### Scenario: Existing data-* attributes are stripped before injection
- **GIVEN** crawled HTML with `<div data-testid="foo" data-analytics="bar">`
- **WHEN** the cleanup pipeline processes the HTML
- **THEN** original `data-*` attributes are removed
- **AND** new `data-bridge-id` attributes are injected

### Requirement: URL validation and SSRF prevention

The crawl engine SHALL validate URLs before crawling. Only `http://` and `https://` schemes are accepted. URLs resolving to private/internal IP ranges (10.x.x.x, 172.16-31.x.x, 192.168.x.x, 127.x.x.x, ::1), `localhost`, or common internal hostnames SHALL be rejected. Maximum URL length is 2048 characters.

#### Scenario: Valid public URL is accepted
- **GIVEN** a URL `https://www.example.com`
- **WHEN** URL validation runs
- **THEN** the URL is accepted and crawling proceeds

#### Scenario: Private IP URL is rejected
- **GIVEN** a URL `http://192.168.1.1/admin`
- **WHEN** URL validation runs
- **THEN** the request is rejected with an error message indicating the URL points to a private network

#### Scenario: Non-HTTP scheme is rejected
- **GIVEN** a URL `ftp://files.example.com/page.html`
- **WHEN** URL validation runs
- **THEN** the request is rejected with an error message indicating only HTTP/HTTPS URLs are supported

### Requirement: HTML size limit enforced

The cleaned HTML output SHALL not exceed 500KB. If the cleaned HTML exceeds this limit, the `<body>` content SHALL be truncated while keeping the `<head>` section intact.

#### Scenario: HTML within size limit
- **GIVEN** crawled HTML that is 200KB after cleanup
- **WHEN** size validation runs
- **THEN** the full HTML is returned without truncation

#### Scenario: HTML exceeds size limit
- **GIVEN** crawled HTML that is 800KB after cleanup
- **WHEN** size validation runs
- **THEN** the body content is truncated to fit within 500KB
- **AND** the head section (stylesheets, meta tags) is preserved intact
