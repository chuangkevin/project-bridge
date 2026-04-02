## Why

Users building prototypes often start from an existing website rather than from scratch. They want to take a live page (e.g., a competitor site, an internal tool, or a design reference), pull it into Project Bridge, and then use the element-select + micro-adjust tools to tweak it. Currently there is no way to import a live URL as a starting point. Users must manually copy-paste HTML or describe the page verbally, which loses layout fidelity and is extremely tedious for complex SPAs rendered by JavaScript.

## What Changes

- **URL input in the design tab**: A dedicated URL input field appears in the DesignPanel where users can paste a website URL and trigger a crawl
- **Playwright headless crawl**: The server launches a Playwright headless Chromium browser to navigate to the URL, wait for JavaScript rendering, and capture the fully-rendered HTML. This handles SPAs (React, Vue, Angular) that return empty HTML from a simple fetch
- **HTML cleanup pipeline**: The captured HTML is sanitized — scripts, tracking pixels, ads, and analytics are stripped. Relative URLs (images, fonts, stylesheets) are converted to absolute URLs pointing back to the original domain so assets continue to load
- **Auto-inject data-bridge-id**: Since crawled HTML has no `data-bridge-id` attributes, the system injects them onto every meaningful element (headings, paragraphs, images, buttons, links, cards, form fields, navs, sections) so that the existing element-select and micro-adjust tools work immediately
- **Save as prototype version**: The cleaned, bridge-id-injected HTML is saved as a new prototype version for the project page, displayed in the preview iframe, and becomes the base for further edits

## Capabilities

### New Capabilities
- `url-crawl-engine`: Server-side service that accepts a URL, launches Playwright headless Chromium, navigates to the page, waits for rendering, captures the full document HTML, removes scripts/tracking/ads, converts relative URLs to absolute, and injects `data-bridge-id` attributes on meaningful DOM elements
- `crawl-to-prototype`: API endpoint and client UI that lets users enter a URL in the design tab, trigger a crawl, receive the cleaned HTML, save it as a prototype version, and display it in the preview iframe for further editing

### Modified Capabilities
- `DesignPanel`: Extended with a URL input field and "crawl" button that triggers the crawl-to-prototype flow
- `PreviewPanel`: No direct changes, but now displays crawled HTML prototypes that may contain external asset references (images, fonts via absolute URLs)

## Impact

- **Server**: New `urlCrawler.ts` service using Playwright to launch headless Chromium, navigate, and capture HTML. New `htmlCleaner.ts` utility for script removal, URL absolutification, and bridge-id injection. New API endpoint `POST /api/projects/:id/crawl-url` that orchestrates the crawl and saves the result as a prototype version
- **Client**: `DesignPanel.tsx` gains a URL input section with a text field, crawl button, and loading/error states
- **Dependencies**: Playwright is already in `packages/server/package.json`. Chromium browser binary must be available in the deployment environment (Docker image needs `npx playwright install chromium`)
- **Performance**: Crawling is an expensive operation (2-10 seconds depending on the target site). The endpoint should be async with a loading indicator on the client. A timeout (30 seconds) prevents hanging on unresponsive sites
- **Security**: The crawl runs server-side in a headless browser sandbox. URLs are validated (must be http/https). Private/internal network URLs should be blocked to prevent SSRF
