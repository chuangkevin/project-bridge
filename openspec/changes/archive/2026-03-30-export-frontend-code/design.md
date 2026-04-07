## Context

Project Bridge generates single-file HTML prototypes with inline CSS and JS. These prototypes use `showPage('pageName')` for navigation, `data-page` attributes for page containers, `data-bridge-id` for component identification, and inline styles for design. The prototypes are stored in the `prototypes` table as HTML strings.

Converting this to framework code requires: splitting pages into separate files, extracting CSS, converting navigation to router, and restructuring JS logic into framework patterns.

## Goals / Non-Goals

**Goals:**
- Convert prototype HTML into idiomatic framework code for React, Vue 3, Next.js, Nuxt 3, and Plain HTML
- Produce a complete, runnable project skeleton (package.json, router config, component files)
- Extract inline styles into separate CSS/module files
- Convert showPage() navigation into framework router (react-router-dom, vue-router)
- Return a downloadable zip with proper directory structure

**Non-Goals:**
- Generating production-ready code (this is a starting point, not a finished product)
- Supporting all frontend frameworks (Angular, Svelte, etc. are future additions)
- Including backend/API code generation
- Real-time preview of exported code

## Decisions

### 1. Use Gemini AI for HTML-to-framework conversion
**Rationale**: The conversion requires understanding HTML structure, extracting components, and generating idiomatic framework code. Regex/AST-based conversion would be brittle and framework-specific. Gemini already powers the generation pipeline and can handle the semantic transformation.
**Alternative**: Rule-based AST transformation. Rejected because the variety of HTML patterns in prototypes makes rules fragile, and framework idioms evolve.

### 2. Per-page conversion with shared context
**Rationale**: Each data-page div is extracted and sent to Gemini as a separate conversion request, but with shared context (design tokens, navigation map, component list). This keeps each request focused and within token limits.
**Alternative**: Send entire HTML to Gemini at once. Rejected because prototypes can be very large (50k+ chars) and the output quality degrades with overly long prompts.

### 3. Zip file response via streaming
**Rationale**: Using `archiver` to create a zip stream that pipes directly to the HTTP response. No temporary files on disk. This is memory-efficient and fast.
**Alternative**: Write to temp directory, then send file. Rejected due to cleanup complexity and disk I/O overhead.

### 4. Framework templates define project skeleton
**Rationale**: Each framework has a predefined template with package.json, config files (vite.config, nuxt.config, etc.), and router setup. Gemini fills in the component files. This ensures the project structure is always valid.
**Alternative**: Have Gemini generate everything including configs. Rejected because config files are boilerplate and Gemini may generate outdated versions.

### 5. Plain HTML export restructures without framework
**Rationale**: Even for "Plain HTML", the export cleans up the prototype: separates CSS into a stylesheet, splits pages into separate HTML files linked by `<a href>`, and creates a clean directory structure. This is useful for static hosting.

## Risks / Trade-offs

- [Risk] Gemini may produce framework code with syntax errors -> Mitigation: Basic syntax validation on generated code; include a README with "getting started" instructions so developers can fix issues
- [Risk] Large prototypes with many pages may hit Gemini token limits -> Mitigation: Per-page conversion with shared context keeps each request manageable
- [Risk] Framework versions and best practices evolve -> Mitigation: Template skeletons are versioned and easily updated; Gemini prompt includes target version numbers
- [Risk] Zip generation for large projects may be slow -> Mitigation: Stream response; show progress indicator on client; typical projects are 5-10 pages which should complete in under 30 seconds
- [Risk] `archiver` dependency adds to server bundle -> Mitigation: It's a well-maintained, lightweight package (no native dependencies)
