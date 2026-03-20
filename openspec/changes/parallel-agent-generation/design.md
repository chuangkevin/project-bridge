## Context

project-bridge currently generates multi-page prototypes in a single Gemini API call (`chat.ts` line 602-617). The system prompt + all specs + all page definitions are packed into one request with `maxOutputTokens: 65536`. This works for 2-3 pages but degrades for 5+ pages — later pages get truncated or filled with placeholder content.

The Design Convention system (`design_convention` column in projects table) stores a text blob describing brand colors. The `designSpecAnalyzer` extracts visual properties from reference images. Neither produces structured, reusable design tokens.

Existing infrastructure: Playwright is installed (used for E2E tests), Gemini 2.5 Flash with 4-key rotation (80 calls/day free tier), SSE streaming for chat responses, `htmlSanitizer.ts` for post-processing.

## Goals / Non-Goals

**Goals:**
- Generate each page independently via parallel Gemini calls for consistent quality
- Extract real CSS values from reference websites (not AI-guessed approximations)
- Produce a unified design tokens JSON that all sub-agents share
- Maintain priority: user reference images > spec documents > crawled websites
- Show per-page progress in the UI during generation
- Allow users to review and tweak design tokens before generation
- Support error recovery: retry individual failed pages without regenerating all

**Non-Goals:**
- Real-time collaborative editing of prototypes
- Full design system management (Figma-level token management)
- Server-side rendering or SSR of prototypes
- Supporting non-Gemini LLM providers (OpenAI, Claude API)
- Responsive breakpoint generation (each page is either mobile or desktop, not both)

## Decisions

### D1: Website Crawler — Playwright evaluate() vs external CSS parser

**Decision**: Use Playwright `page.evaluate()` to extract `getComputedStyle()` from live DOM elements.

**Why**: Computed styles reflect the actual rendered values including inheritance, media queries, and CSS variable resolution. A static CSS parser would miss runtime-computed values and require resolving `var()`, `calc()`, etc.

**Alternatives considered**:
- CSS parser (postcss): Only parses stylesheet files, misses computed inheritance and runtime values
- Headless Chrome CDP: More complex API, Playwright already abstracts this

**Implementation**:
```
page.evaluate(() => {
  const elements = {
    h1: document.querySelectorAll('h1'),
    h2: document.querySelectorAll('h2'),
    body: document.querySelectorAll('p, span'),
    buttons: document.querySelectorAll('button, .btn, [role="button"]'),
    inputs: document.querySelectorAll('input, select, textarea'),
    cards: document.querySelectorAll('.card, [class*="card"]'),
    nav: document.querySelectorAll('nav, header'),
  };
  // For each category, extract getComputedStyle properties
  // Return aggregated style data
})
```

### D2: Design Token Format — flat CSS variables vs structured JSON

**Decision**: Structured JSON with CSS variable output adapter.

**Why**: Structured JSON preserves semantic meaning (e.g., `typography.h1.size` vs `--h1-size`). The assembler converts to CSS variables at build time. This also enables the frontend token editor to show grouped, labeled controls.

**Token schema**:
```json
{
  "colors": {
    "primary": "#8E6FA7",
    "primaryLight": "#B89FCC",
    "primaryDark": "#6B4F82",
    "secondary": "#6B5B8A",
    "background": "#F8F6FB",
    "surface": "#FFFFFF",
    "text": "#2D2D2D",
    "textSecondary": "#6B7280",
    "border": "#E5E7EB",
    "error": "#DC2626",
    "success": "#16A34A"
  },
  "typography": {
    "fontFamily": "\"Noto Sans TC\", \"Helvetica Neue\", sans-serif",
    "h1": { "size": "28px", "weight": "700", "lineHeight": "1.3" },
    "h2": { "size": "22px", "weight": "600", "lineHeight": "1.4" },
    "h3": { "size": "18px", "weight": "600", "lineHeight": "1.5" },
    "body": { "size": "15px", "weight": "400", "lineHeight": "1.6" },
    "small": { "size": "13px", "weight": "400", "lineHeight": "1.5" }
  },
  "spacing": {
    "xs": "4px", "sm": "8px", "md": "16px", "lg": "24px", "xl": "32px", "xxl": "48px"
  },
  "borderRadius": {
    "sm": "4px", "md": "8px", "lg": "12px", "xl": "16px", "full": "9999px"
  },
  "shadows": {
    "sm": "0 1px 2px rgba(0,0,0,0.05)",
    "md": "0 4px 6px rgba(0,0,0,0.07)",
    "lg": "0 10px 15px rgba(0,0,0,0.1)"
  },
  "components": {
    "button": { "height": "40px", "paddingX": "16px", "radius": "8px" },
    "input": { "height": "44px", "paddingX": "12px", "radius": "8px", "borderWidth": "1px" },
    "card": { "padding": "16px", "radius": "12px", "shadow": "md" }
  },
  "source": {
    "referenceImages": ["file-id-1"],
    "specDocuments": ["file-id-2"],
    "crawledUrls": ["https://example.com"]
  }
}
```

### D3: Priority Merge Strategy

**Decision**: Three-layer merge with explicit override chain.

```
Layer 1 (base):     Crawled website styles → all properties filled
Layer 2 (override): Spec document analysis → components, layout, business rules override
Layer 3 (final):    User reference images  → colors, typography, visual style override
```

Each layer only overrides properties it has confident data for. The compiler tracks `source` per property for transparency.

### D4: Master Agent Output Format

**Decision**: Master produces a planning JSON (not HTML).

```json
{
  "shell": {
    "hasNav": true,
    "navType": "top-bar",
    "navItems": ["選擇範本", "選擇物件", "選擇額度"],
    "hasFooter": false
  },
  "sharedCss": "/* nav, layout grid, utility classes */",
  "pages": [
    {
      "name": "選擇範本",
      "viewport": "desktop",
      "spec": "... (full spec for this page from analysis_result)",
      "constraints": "Radio buttons for 5 templates, preview area, edit modal",
      "navigationOut": ["選擇物件"]
    }
  ]
}
```

Sub-agents receive: design tokens + sharedCss + their page entry only.

### D5: Sub-Agent Output — page fragment vs full HTML

**Decision**: Each sub-agent returns a `<div class="page" id="page-{name}">...</div>` fragment with `<style>` scoped to that page (using page-specific class prefix).

**Why**: Avoids duplicate `<html>`, `<head>`, CSS variable declarations. Assembler handles the wrapper.

### D6: Parallel Execution with Rate Limit Awareness

**Decision**: Batch parallel calls based on available keys.

```
keys = 4, RPM per key = 15
→ Can safely run 4 parallel calls (1 per key)
→ For 6+ pages: batch into groups of 4, then remaining
```

Implementation: assign each sub-agent call to a different API key.

### D7: SSE Progress Protocol

**Decision**: Extend existing SSE with structured progress events.

```
data: {"phase":"planning","message":"分析頁面架構..."}
data: {"phase":"tokens","message":"提取設計規範..."}
data: {"phase":"generating","page":"選擇範本","status":"started","progress":"1/3"}
data: {"phase":"generating","page":"選擇物件","status":"started","progress":"2/3"}
data: {"phase":"generating","page":"選擇範本","status":"done","progress":"1/3"}
data: {"phase":"generating","page":"選擇物件","status":"done","progress":"2/3"}
data: {"phase":"generating","page":"選擇額度","status":"started","progress":"3/3"}
data: {"phase":"generating","page":"選擇額度","status":"done","progress":"3/3"}
data: {"phase":"assembling","message":"組裝原型..."}
data: {"done":true,"html":"...","pages":[...]}
```

Frontend shows a progress panel with page-level status indicators.

### D8: Design Token Storage

**Decision**: New `design_tokens` column on `projects` table (JSON text), not a separate table.

**Why**: Tokens are 1:1 with projects. A separate table adds join complexity for no benefit. JSON column is sufficient for the token schema size (~2KB).

## Risks / Trade-offs

**[Risk] Sub-agent style drift** → Each sub-agent generates independently, may produce slightly different spacing/sizing despite shared tokens.
→ Mitigation: Assembler runs a "consistency pass" — extracts all CSS from fragments, deduplicates, and replaces with shared CSS variable references. Also, the shared CSS from Master includes utility classes that sub-agents are instructed to use.

**[Risk] Crawler blocked by sites** → Some sites block headless browsers or require login.
→ Mitigation: Crawler has a 15s timeout per URL; if blocked, skip and log warning. Users can still provide reference images as fallback. Show clear error message in UI.

**[Risk] Rate limit with free tier** → 4 keys × 15 RPM = 60 RPM, but daily limit is 20 RPD per key.
→ Mitigation: Full generation = 1 master + N sub-agents + 1 token compile = N+2 calls. For 5 pages = 7 calls. With 4 keys that's ~11 generations/day. If users hit limits, degrade gracefully with queued generation.

**[Risk] Increased total token usage** → Parallel approach uses ~15% more tokens (design tokens repeated in each sub-agent prompt).
→ Mitigation: Design tokens JSON is ~2KB; the quality improvement from focused per-page generation far outweighs the token cost.

**[Trade-off] Latency for small prototypes** → Single-page or 2-page prototypes may be slightly slower due to master planning overhead.
→ Decision: If pages ≤ 2, bypass master/sub-agent and use current single-call approach.
