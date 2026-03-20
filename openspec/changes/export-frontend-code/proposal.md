## Why

Project Bridge generates high-fidelity HTML prototypes, but users need real framework code for production development. Currently, developers must manually rewrite the prototype HTML into React, Vue, Next.js, or Nuxt components -- a tedious process that loses the design fidelity achieved during prototyping. Exporting directly to framework-specific code closes the gap between prototype and production, making the tool valuable beyond the design phase.

## What Changes

- Add a server-side export service that converts prototype HTML into framework-specific project code using Gemini AI
- Support 5 framework targets: React (JSX + CSS Modules), Vue 3 (SFC .vue files), Next.js (pages/ directory), Nuxt 3 (pages/ directory), Plain HTML (cleaned up)
- Each prototype page becomes a separate component/file in the target framework
- Design tokens are extracted into CSS variables or Tailwind config
- Navigation (`showPage()` calls) is converted to framework router usage (react-router, vue-router)
- API binding placeholders become `fetch()` calls or framework composables
- Returns a downloadable zip file containing the full project structure
- Add client UI: export dropdown with framework selector and download button in the prototype preview area

## Capabilities

### New Capabilities
- `framework-export`: Server-side AI-powered conversion of prototype HTML to framework-specific project code with zip download

### Modified Capabilities
_None -- existing prototype generation and preview are unchanged._

## Impact

- **Server**: New `exportService.ts` in `packages/server/src/services/`; new `POST /api/projects/:id/export` route; uses Gemini API for code conversion
- **Client**: New export dropdown UI in prototype preview toolbar
- **Dependencies**: `archiver` npm package for zip file creation (server-side)
- **API**: New endpoint `POST /api/projects/:id/export` accepting `{ framework: string }` and returning a zip file stream
