## 1. Website Style Crawler

- [x] 1.1 Create `packages/server/src/services/websiteCrawler.ts` — Playwright launch, navigate to URL, extract computed styles via page.evaluate() (typography, colors, spacing, shadows, component styles)
- [x] 1.2 Add `POST /api/projects/:projectId/crawl-website` endpoint in new `packages/server/src/routes/crawl.ts` — accept URL, call crawler, return structured styles + screenshot
- [x] 1.3 Write test: crawl a known public website → verify extracted styles contain font-family, primary colors, and spacing values
- [x] 1.4 Run test, verify pass, commit: `feat: add website style crawler with Playwright CSS extraction`

## 2. Design Token Compiler

- [x] 2.1 Create `packages/server/src/services/designTokenCompiler.ts` — merge 3 sources (reference images via visual analysis, spec docs via analysis_result, crawled styles) with priority ordering into unified token JSON
- [x] 2.2 Add `design_tokens` TEXT column to `projects` table (migration in `packages/server/src/db/connection.ts`)
- [x] 2.3 Add `POST /api/projects/:projectId/compile-tokens` endpoint — trigger compilation, save to DB, return tokens
- [x] 2.4 Auto-trigger recompilation when new reference image is uploaded or new website is crawled
- [x] 2.5 Write test: provide mock data from all 3 sources → verify priority merge produces correct tokens (image color > spec component > crawled font)
- [x] 2.6 Run test, verify pass, commit: `feat: add design token compiler with priority-based source merging`

## 3. Design Token Editor UI

- [ ] 3.1 Create `packages/client/src/components/DesignTokenEditor.tsx` — grouped editor (Colors with swatches, Typography with font preview, Spacing with numeric inputs, Components with size inputs)
- [ ] 3.2 Add manual override support — mark edited tokens as `manualOverride: true`, preserve across recompilation
- [ ] 3.3 Add URL input + "Extract Styles" button that calls crawl-website endpoint
- [ ] 3.4 Add "Compile Tokens" button for initial/recompile workflow
- [ ] 3.5 Add live preview panel showing sample components (button, card, input, heading) rendered with current tokens
- [ ] 3.6 Integrate DesignTokenEditor into project page (new tab or section in WorkspacePage)
- [ ] 3.7 Write Playwright test: open editor → change color → verify preview updates → save → verify DB persisted
- [ ] 3.8 Run test, verify pass, commit: `feat: add design token editor UI with live preview and manual overrides`

## 4. Master Agent + Sub-Agent Pipeline

- [x] 4.1 Create `packages/server/src/services/masterAgent.ts` — reads analysis_result + design_tokens, produces generation plan JSON (shell definition, sharedCss, per-page assignments)
- [x] 4.2 Create `packages/server/src/services/subAgent.ts` — receives design tokens + sharedCss + single page spec, returns HTML fragment `<div class="page">...</div>`
- [x] 4.3 Create `packages/server/src/services/htmlAssembler.ts` — merges fragments into complete HTML: inject `:root` CSS variables from tokens, shared CSS, showPage() function, DOMContentLoaded init
- [x] 4.4 Add key-per-agent assignment: each parallel sub-agent uses a different API key via getGeminiApiKeyExcluding()
- [x] 4.5 Add batch execution: if pages > available keys, run in batches of key-count size
- [x] 4.6 Add fragment normalization in assembler: if sub-agent returns full HTML instead of fragment, extract body content and wrap correctly
- [x] 4.7 Write test: mock master plan + 3 page specs → generate fragments → assemble → verify complete HTML has all pages, showPage(), and unified CSS variables
- [x] 4.8 Run test, verify pass, commit: `feat: add master/sub-agent parallel page generation pipeline`

## 5. Chat.ts Integration

- [x] 5.1 Refactor chat.ts generation flow: if pages ≥ 3, use master/sub-agent pipeline; if ≤ 2, use current single-call
- [x] 5.2 Pass design_tokens from DB to master agent; if no tokens exist, fall back to convention-based injection
- [x] 5.3 Wire up sanitizer + convention color injection + validator on assembled output (same post-processing as current flow)
- [x] 5.4 Add retry logic: if a sub-agent fails, retry once with a different API key before returning partial result
- [x] 5.5 Write integration test: upload spec PDF → trigger generation → verify parallel pipeline produces valid multi-page prototype
- [x] 5.6 Run test, verify pass, commit: `feat: integrate parallel generation pipeline into chat flow`

## 6. SSE Page Progress Streaming

- [x] 6.1 Add structured SSE events in chat.ts parallel path: phase events (planning, tokens, generating, assembling) and per-page status events (started, done, error)
- [x] 6.2 Update `packages/client/src/components/ChatPanel.tsx` — parse new SSE event format, show progress panel with per-page status indicators during generation
- [x] 6.3 Add progress panel component with page rows (name + spinner/checkmark/X icon)
- [x] 6.4 Maintain backward compatibility: single-call path (≤2 pages) continues using existing raw content streaming
- [x] 6.5 Write Playwright test: trigger 3-page generation → verify progress panel appears → shows per-page status → transitions to final prototype
- [x] 6.6 Run test, verify pass, commit: `feat: add per-page progress streaming for parallel generation`

## 7. Modified Capabilities Integration

- [ ] 7.1 Update css-variable-extraction to prefer reading from design_tokens JSON when available, fall back to HTML parsing
- [ ] 7.2 Update live-style-injection to use design_tokens format for generating `:root` CSS variable block
- [ ] 7.3 Write test: project with design_tokens → style tweaker reads tokens correctly → live injection applies token values
- [ ] 7.4 Run test, verify pass, commit: `feat: integrate design tokens with style tweaker and live injection`

## 8. End-to-End Validation

- [ ] 8.1 Full pipeline Playwright test: create project → add reference URL → upload spec PDF → compile tokens → edit a token → generate prototype → verify all pages have consistent styles matching tokens
- [ ] 8.2 Add `.gitignore` entries for any new test artifacts
- [ ] 8.3 Run full test suite, verify all pass, commit: `test: validate full parallel generation pipeline end-to-end`
