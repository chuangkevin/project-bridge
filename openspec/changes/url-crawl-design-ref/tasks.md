## Phase 1: Server — URL crawl engine service

- [ ] 1.1 Create `packages/server/src/services/urlCrawler.ts` — export `crawlUrl(url: string): Promise<string>` that launches Playwright headless Chromium, navigates to the URL with a 30-second timeout, waits for `networkidle`, captures `page.content()`, and closes the browser. Throw descriptive errors for navigation failures (404, connection refused, timeout)
- [ ] 1.2 In `urlCrawler.ts` — export `validateUrl(url: string): { valid: boolean; error?: string }` that checks HTTP/HTTPS scheme, rejects private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, ::1, localhost), and enforces 2048-char max length
- [ ] 1.3 Create `packages/server/src/services/htmlCleaner.ts` — export `cleanCrawledHtml(html: string, baseUrl: string): string` that removes `<script>`, `<noscript>`, inline `on*` event handlers, tracking elements, unnecessary `<link>`/`<meta>` tags; converts relative URLs in `src`, `href`, `srcset`, and inline `style` `url()` to absolute using `baseUrl`; strips existing `data-*` attributes
- [ ] 1.4 In `htmlCleaner.ts` — export `injectBridgeIds(html: string): string` that walks the DOM and adds `data-bridge-id="crawl-{index}"` to meaningful elements (h1-h6, p, a, button, img, input, textarea, select, nav, header, footer, section, article, main, aside, form, ul, ol, li, table, figure, blockquote, qualifying divs/spans). Div qualifies if it has direct text, <=3 children, or card-like class names. Span qualifies only with direct text content
- [ ] 1.5 In `htmlCleaner.ts` — export `enforceMaxSize(html: string, maxBytes: number): string` that truncates `<body>` content if total HTML exceeds the limit while preserving `<head>`
- [ ] 1.6 Test: `packages/server/src/services/__tests__/htmlCleaner.test.ts` — unit tests for script removal, URL absolutification, bridge-id injection (headings, skipped wrapper divs, card-like divs, spans), data-* stripping, size enforcement
- [ ] 1.7 Test: `packages/server/src/services/__tests__/urlCrawler.test.ts` — unit tests for URL validation (valid public URL, private IP rejected, non-HTTP rejected, localhost rejected, too-long URL rejected)
- [ ] 1.8 Commit: "feat: add URL crawl engine with Playwright and HTML cleanup pipeline"

## Phase 2: Server — Crawl-to-prototype API endpoint

- [ ] 2.1 Create route handler in `packages/server/src/routes/prototypes.ts` (or new file `crawl.ts`) — `POST /api/projects/:id/crawl-url` accepting `{ url: string, pageId?: string }`. Validate project exists, validate URL, call `crawlUrl()`, then `cleanCrawledHtml()`, then `injectBridgeIds()`, then `enforceMaxSize()`
- [ ] 2.2 Save the cleaned HTML as a new prototype version using the existing prototype save mechanism. Store metadata `{ source: "url-crawl", sourceUrl: url }` on the version
- [ ] 2.3 Return `{ success: true, html, versionId }` on success. Return 400 for invalid URL, 404 for project not found, 502 for crawl failure
- [ ] 2.4 Add concurrency guard: only 1 crawl at a time per server instance (use a simple mutex/semaphore). Return 429 if a crawl is already in progress
- [ ] 2.5 Register the route in the Express app router
- [ ] 2.6 Test: `packages/e2e/tests/api/crawl-url.spec.ts` — API tests: successful crawl returns HTML with bridge-ids, invalid URL returns 400, non-existent project returns 404
- [ ] 2.7 Commit: "feat: add POST /api/projects/:id/crawl-url endpoint"

## Phase 3: Client — URL input UI in DesignPanel

- [ ] 3.1 In `packages/client/src/components/DesignPanel.tsx`, add state variables: `crawlUrl`, `crawling`, `crawlError`
- [ ] 3.2 Add a collapsible section "匯入網頁" (Import from URL) after the reference images section. Section is collapsed by default. Contains: text input for URL, crawl button with loading spinner
- [ ] 3.3 Implement `handleCrawl()`: call `POST /api/projects/${projectId}/crawl-url` with the URL. On success, show success toast and trigger preview refresh (call `onSaved` or equivalent callback). On error, set `crawlError` with the error message
- [ ] 3.4 Disable the crawl button when URL is empty or while crawling is in progress. Show "crawling... ~5s" text during loading
- [ ] 3.5 Display `crawlError` inline below the URL input when present. Clear error when URL input changes
- [ ] 3.6 Test: `packages/e2e/tests/e2e/url-crawl.spec.ts` — Playwright E2E test: open design tab, expand URL import section, enter a URL, click crawl, verify loading state appears, verify preview updates with crawled content (use a local test server or mock)
- [ ] 3.7 Commit: "feat: add URL import section in DesignPanel with crawl button"

## Phase 4: Integration test — full crawl-to-preview pipeline

- [ ] 4.1 Playwright E2E test `packages/e2e/tests/e2e/url-crawl-e2e.spec.ts`: create a project, navigate to design tab, enter a test URL (serve a local HTML page from the test fixture), trigger crawl, verify the preview iframe shows the crawled content with bridge-ids, verify element-select works on the crawled elements, verify version history shows the new version
- [ ] 4.2 Commit: "test: add E2E test for URL crawl to prototype pipeline"
