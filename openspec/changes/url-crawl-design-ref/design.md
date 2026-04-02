## Context

The server already has Playwright as a dependency (`packages/server/package.json`). The `DesignPanel.tsx` component renders design tokens, reference images, and style settings for a project. The `PreviewPanel.tsx` renders prototype HTML inside an iframe. Prototype versions are stored via the prototypes route (`packages/server/src/routes/prototypes.ts`) and can be saved/versioned. The `componentExtractor.ts` service works with `data-bridge-id` attributes to extract and replace individual elements. The `bridgeScript.ts` utility on the client handles element selection overlays for elements with `data-bridge-id`.

What is missing: there is no mechanism to import a live website's rendered HTML as a prototype starting point, and no HTML cleanup pipeline to make arbitrary crawled HTML compatible with the bridge-id element-select system.

## Goals / Non-Goals

**Goals:**
- Add a URL input field in the DesignPanel where users can paste a website URL
- Crawl the URL using Playwright headless Chromium to capture fully-rendered HTML (including JS-rendered SPA content)
- Clean the captured HTML: remove `<script>` tags, tracking pixels, analytics, inline event handlers; convert relative URLs to absolute
- Inject `data-bridge-id` attributes on meaningful elements so element-select and micro-adjust work out of the box
- Save the cleaned HTML as a new prototype version and display it in the preview iframe
- Show loading state during crawl (2-10 seconds typical) and handle errors gracefully

**Non-Goals:**
- Crawling multiple pages or following links (single-page crawl only)
- Preserving JavaScript interactivity from the crawled site
- Downloading and hosting external assets locally (images/fonts remain as absolute URLs to the original domain)
- Authentication or cookie-based crawling (only publicly accessible pages)
- Crawling sites behind CAPTCHAs or bot protection
- Style extraction / design token analysis from the crawled page (that's a separate feature in design-preset-system)

## Decisions

### 1. Use Playwright headless Chromium, not fetch/axios

**Decision**: Launch a Playwright Chromium browser instance to navigate to the URL, wait for `networkidle` (or a 10-second timeout), then capture `page.content()`.

**Why**: Simple HTTP fetch only gets the initial HTML response, which is empty or minimal for SPAs (React, Vue, Angular apps). Playwright executes JavaScript and waits for the page to fully render, capturing the final DOM state including dynamically loaded content.

**Trade-off**: Playwright is heavier (needs Chromium binary, ~2-10s per crawl). Acceptable because crawling is an infrequent user-initiated action, not a background batch process.

### 2. HTML cleanup: strip scripts, absolutify URLs, remove tracking

**Decision**: After capturing `page.content()`, process the HTML through a cleanup pipeline:
1. Remove all `<script>` tags and `<noscript>` tags
2. Remove all inline event handlers (`onclick`, `onload`, `onerror`, etc.)
3. Remove known tracking elements (pixels, analytics iframes, ad containers)
4. Remove `<link rel="preload">`, `<link rel="prefetch">`, `<meta>` tags except charset/viewport
5. Convert relative `src`, `href`, `srcset`, `url()` in inline styles to absolute URLs using the crawled page's base URL
6. Strip `data-*` attributes from the original page to avoid conflicts (except `data-bridge-id` which we inject)

**Why**: Scripts would execute in the preview iframe and cause errors or security issues. Relative URLs would break when the HTML is served from the Project Bridge domain. Tracking elements add noise and can leak information.

### 3. Bridge-id injection: assign IDs to meaningful elements

**Decision**: Walk the cleaned DOM and add `data-bridge-id="crawl-{index}"` to elements matching these selectors: `h1-h6, p, a, button, img, input, textarea, select, nav, header, footer, section, article, main, aside, form, ul, ol, li, div (with direct text or limited children), table, figure, blockquote, span (with direct text content)`. Skip elements that are purely structural wrappers with no semantic meaning.

**Why**: The element-select overlay and micro-adjust system require `data-bridge-id` attributes. Without them, the crawled page would be view-only. Using a sequential `crawl-{index}` naming scheme avoids conflicts and makes it clear which elements came from crawling vs. generation.

**Heuristic for `div`**: Only inject bridge-id on `<div>` elements that either (a) contain direct text nodes, (b) have 3 or fewer child elements, or (c) have specific class hints suggesting they are a card/component (classes containing `card`, `item`, `hero`, `banner`, etc.). This avoids tagging deeply nested wrapper divs that would clutter the selection overlay.

### 4. API endpoint: POST /api/projects/:id/crawl-url

**Decision**: Create a new endpoint `POST /api/projects/:id/crawl-url` with body `{ url: string, pageId?: string }`. The endpoint validates the URL, launches the crawl, processes the HTML, saves it as a new prototype version for the specified page (or the project's default/first page), and returns `{ success: true, html: string, versionId: number }`.

**Why**: A dedicated endpoint keeps the crawl logic separate from the chat and generation flows. The `pageId` parameter allows crawling into a specific page when the project has multiple pages.

### 5. URL validation and SSRF prevention

**Decision**: Validate the URL before crawling:
- Must be `http://` or `https://` scheme
- Must not resolve to a private/internal IP range (10.x, 172.16-31.x, 192.168.x, 127.x, ::1)
- Must not point to `localhost` or common internal hostnames
- Maximum URL length: 2048 characters

**Why**: Server-side request forgery (SSRF) prevention. The server should not be tricked into crawling internal services.

### 6. Timeout and resource limits

**Decision**: Playwright navigation timeout: 30 seconds. If the page doesn't reach `networkidle` within 30s, capture whatever has rendered so far. Maximum HTML size after cleanup: 500KB. If larger, truncate the `<body>` content while keeping the `<head>` intact.

**Why**: Some sites load indefinitely (infinite scroll, real-time feeds). The timeout ensures the crawl always completes. The size limit prevents storing excessively large prototypes that would degrade the editing experience.

### 7. Client UI: URL input in DesignPanel

**Decision**: Add a collapsible section in `DesignPanel.tsx` titled "Import from URL" (匯入網頁) with a text input for the URL and a crawl button. Show a loading spinner with estimated time ("crawling... ~5s") during the operation. On success, show a toast and refresh the preview. On error, show the error message inline.

**Why**: The design tab is the natural home for design reference inputs. A dedicated section keeps it discoverable but not cluttering the main design token editing area.

## Risks / Trade-offs

- **Chromium binary size**: Playwright Chromium adds ~300MB to the Docker image. Already installed since Playwright is an existing dependency.
- **Crawl performance**: 2-10 seconds per crawl is acceptable for user-initiated actions but would be too slow for batch operations. Rate limiting (1 concurrent crawl per server) prevents resource exhaustion.
- **External asset availability**: Crawled pages reference images/fonts on the original domain. If the original site goes down or blocks hotlinking, assets will break in the prototype. Acceptable trade-off vs. downloading and hosting all assets locally.
- **Complex SPAs**: Some SPAs require scrolling to trigger lazy loading, or have client-side routing that prevents direct URL access. The current implementation captures what renders on initial page load without scrolling or interaction. This is a known limitation.
- **Bot protection**: Sites with Cloudflare, reCAPTCHA, or aggressive bot detection will block the crawl. The error message should clearly indicate this to the user.
