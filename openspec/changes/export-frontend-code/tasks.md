## 1. Server: Export Service Foundation

- [ ] 1.1 Create `packages/server/src/services/exportService.ts` with the main `exportPrototype(projectId: string, framework: string): Promise<Buffer>` function signature
- [ ] 1.2 Add `archiver` npm dependency to server package.json
- [ ] 1.3 Implement prototype HTML retrieval from DB and page splitting by `data-page` attributes
- [ ] 1.4 Implement design token extraction (find repeated colors, fonts, spacing) and generate CSS variables file
- [ ] 1.5 Write unit test: verify page splitting and token extraction on sample HTML
- [ ] 1.6 Commit: "feat: add export service foundation with page splitting and token extraction"

## 2. Server: Framework Templates

- [ ] 2.1 Create template skeletons for React (package.json, vite.config.js, src/App.jsx, src/router.jsx)
- [ ] 2.2 Create template skeletons for Vue 3 (package.json, vite.config.js, src/App.vue, src/router/index.js)
- [ ] 2.3 Create template skeletons for Next.js (package.json, next.config.js, pages/_app.jsx)
- [ ] 2.4 Create template skeletons for Nuxt 3 (package.json, nuxt.config.ts, app.vue)
- [ ] 2.5 Create template for Plain HTML (index.html, styles.css, directory structure)
- [ ] 2.6 Write unit test: verify each template produces valid package.json with correct dependencies
- [ ] 2.7 Commit: "feat: add project skeleton templates for React, Vue, Next.js, Nuxt, HTML"

## 3. Server: AI-Powered Code Conversion

- [ ] 3.1 Implement Gemini prompt for per-page HTML-to-framework conversion with shared context (design tokens, nav map, component list)
- [ ] 3.2 Implement React conversion: JSX components with CSS Modules, react-router-dom navigation
- [ ] 3.3 Implement Vue 3 conversion: SFC .vue files with scoped styles, vue-router navigation
- [ ] 3.4 Implement Next.js conversion: pages/ directory with next/link navigation
- [ ] 3.5 Implement Nuxt 3 conversion: pages/ directory with NuxtLink navigation
- [ ] 3.6 Implement Plain HTML conversion: separate HTML files with anchor links, extracted CSS
- [ ] 3.7 Write Playwright test: export a generated prototype to each framework, verify zip contents include expected files
- [ ] 3.8 Commit: "feat: implement AI-powered HTML-to-framework conversion via Gemini"

## 4. Server: Export Endpoint

- [ ] 4.1 Add `POST /api/projects/:id/export` route accepting `{ framework }` body
- [ ] 4.2 Validate framework parameter against supported list; return 400 for invalid
- [ ] 4.3 Check prototype exists; return 400 if no prototype available
- [ ] 4.4 Call exportService, create zip with `archiver`, stream response with correct Content-Type and Content-Disposition headers
- [ ] 4.5 Write Playwright test: call export endpoint, verify zip response is valid and contains expected file structure
- [ ] 4.6 Commit: "feat: add POST /api/projects/:id/export endpoint returning zip file"

## 5. Client: Export UI

- [ ] 5.1 Add export dropdown button to prototype preview toolbar with framework options (React, Vue 3, Next.js, Nuxt 3, Plain HTML) and icons
- [ ] 5.2 Implement framework selection handler that POSTs to export endpoint and triggers browser download of the zip response
- [ ] 5.3 Add loading spinner state during export; disable button while in progress
- [ ] 5.4 Handle errors (no prototype, export failure) with user-friendly messages
- [ ] 5.5 Write Playwright test: open prototype preview, click export dropdown, select React, verify download triggers
- [ ] 5.6 Commit: "feat: add export dropdown UI with framework selector in prototype preview"
