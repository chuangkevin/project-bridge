## 1. Dependencies & DB Migration

- [x] 1.1 Add `pdfjs-dist` and `canvas` to `packages/server/package.json`
- [x] 1.2 Add DB migration in `migrate.ts`: ALTER TABLE uploaded_files ADD COLUMN visual_analysis TEXT; ADD COLUMN visual_analysis_at TEXT
- [x] 1.3 Verify migration runs on server start without errors

## 2. PDF Page Renderer

- [x] 2.1 Create `packages/server/src/services/pdfPageRenderer.ts` — exports `renderPdfPages(filePath: string, maxPages: number): Promise<Buffer[]>` using pdfjs-dist + canvas
- [x] 2.2 Handle errors gracefully: return empty array on any rendering failure, log warning

## 3. Vision Analysis Service

- [x] 3.1 Create `packages/server/src/services/designSpecAnalyzer.ts` — exports `analyzeDesignSpec(images: Buffer[], apiKey: string): Promise<string>` using gpt-4o with component-extraction prompt
- [x] 3.2 Component-extraction prompt requests: color palette (hex), card layout, search bar style, tag/chip style, nav pattern, typography scale, spacing/grid
- [x] 3.3 Use `detail: 'low'` for all images to control token cost

## 4. Upload Route Integration

- [x] 4.1 In `routes/upload.ts`, after text extraction: if PDF and API key available, call `renderPdfPages` (max 6 pages) then `analyzeDesignSpec` and store result in `uploaded_files.visual_analysis`
- [x] 4.2 In `routes/upload.ts`, if image file (PNG/JPG/WebP) and API key available, call `analyzeDesignSpec` with the image buffer and store in `visual_analysis`
- [x] 4.3 Set `visual_analysis_at = datetime('now')` when storing analysis
- [x] 4.4 Return `visualAnalysisReady: boolean` field in upload response JSON

## 5. AI Prompt Injection

- [x] 5.1 In `routes/chat.ts`, after the project design block: query `SELECT original_name, visual_analysis FROM uploaded_files WHERE project_id = ? AND visual_analysis IS NOT NULL`
- [x] 5.2 If results exist, build `=== DESIGN SPEC ANALYSIS ===` block with per-file sections and append to `effectiveSystemPrompt`
- [x] 5.3 Block placement: after project design/supplement blocks, before art style block

## 6. Client UI

- [x] 6.1 In `packages/client`, update upload API response type to include `visualAnalysisReady: boolean`
- [x] 6.2 In the file list / upload area, show a "Visual Analysis" badge (e.g., eye icon) next to files where visual analysis was performed
- [x] 6.3 Show analysis status in upload success feedback (e.g., "Uploaded + visual analysis complete" vs "Uploaded")

## 7. Tests

- [x] 7.1 Add API test in `packages/e2e/tests/api/design-spec-analysis.spec.ts` — upload a PNG image, verify response has `visualAnalysisReady` field (true if API key set, false otherwise)
- [x] 7.2 Add API test — verify `GET /api/projects/:id/upload` list (or chat) reflects analysis in system (seed analysis directly in DB, verify chat system prompt includes it via a mock or by checking DB state)
- [x] 7.3 Add unit-style test for `pdfPageRenderer` — test with a real single-page PDF, verify returns at least one Buffer or empty array on bad input
