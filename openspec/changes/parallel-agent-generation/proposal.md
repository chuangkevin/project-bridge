## Why

Current prototype generation uses a single Gemini API call to produce ALL pages at once. This causes:
1. **Token exhaustion** — 6+ pages exceed output limits, causing truncation and placeholder content
2. **Quality degradation** — later pages in the output are consistently worse than early pages
3. **Style inconsistency** — no shared design tokens; AI picks different colors/fonts each generation
4. **No error recovery** — one bad page means regenerating everything
5. **Slow** — sequential generation of all pages in one 60s+ call

## What Changes

- **New: Website CSS crawler** — Playwright-based tool that visits reference URLs and extracts computed styles (fonts, colors, spacing, component patterns) into structured data
- **New: Design Token Compiler** — merges 3 sources (user reference images > spec documents > crawled websites) into a unified design tokens JSON with explicit priority ordering
- **New: Design Tokens editor UI** — settings panel where users can view/edit extracted tokens before generation
- **New: Master Agent** — plans page assignments, produces shared shell HTML + design tokens, delegates to sub-agents
- **New: Parallel Sub-Agents** — each generates a single page fragment using shared design tokens + page-specific spec; runs via Promise.all for concurrency
- **New: HTML Assembler** — merges page fragments into a complete prototype with unified CSS, showPage() navigation, and sanitization
- **Modified: SSE streaming** — reports per-page progress events (planning → generating page X → assembling) instead of raw token stream
- **Modified: chat.ts generation flow** — replaced single-call generation with master/sub-agent orchestration

## Capabilities

### New Capabilities
- `website-style-crawler`: Playwright-based extraction of CSS properties (typography, colors, spacing, component styles) from reference URLs
- `design-token-compiler`: Priority-based merging of multiple design sources (reference images, spec docs, crawled sites) into unified design tokens JSON
- `design-token-editor`: Frontend UI for viewing, editing, and persisting design tokens per project
- `parallel-page-generation`: Master/sub-agent orchestration — master plans, sub-agents generate pages concurrently, assembler merges results
- `page-progress-streaming`: SSE event protocol for per-page generation progress reporting

### Modified Capabilities
- `css-variable-extraction`: Now receives design tokens from compiler instead of extracting from convention text; token format extends current CSS variable structure
- `live-style-injection`: Must apply design tokens from the new unified format in addition to current convention-based injection

## Impact

- **Server routes**: `chat.ts` generation flow completely restructured; new routes for website crawling and design token management
- **Server services**: 5 new service files (crawler, compiler, masterAgent, subAgent, assembler)
- **Client**: New DesignTokenEditor component in settings/project page; ChatPanel updated for page-progress SSE events
- **Dependencies**: Playwright (already installed) used server-side for crawling
- **API calls**: Changes from 1 large call to 1 master + N sub-agent calls (parallel); net token usage ~15% higher but quality significantly better
- **Rate limits**: 4 free Gemini keys × 15 RPM = 60 RPM; parallel generation of 6 pages uses 7 calls (1 master + 6 sub) — well within limits
- **DB schema**: New `design_tokens` table for persisted tokens per project; new `generation_jobs` table for tracking parallel generation status
