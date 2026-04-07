## Context

The server already has a Vision API pipeline for PPTX/DOCX files: it extracts embedded images (up to 3) and sends them to `gpt-4o` for a brief art style description (`artStyleExtractor.ts`). PDFs are handled by `textExtractor.ts` which uses `pdf-parse` — text only, no image rendering. The AI prompt assembly in `chat.ts` has an ordered injection pattern (global design → project design → supplement → art style) that we extend with a new `=== DESIGN SPEC ANALYSIS ===` block.

The gap: uploaded PDF design specs carry rich visual information (component layouts, color grids, UI wireframes) that is completely ignored today.

## Goals / Non-Goals

**Goals:**
- PDF pages rendered to PNG images using `pdfjs-dist` + `canvas` (no Ghostscript)
- Up to 6 pages analyzed per PDF via Vision API using a component-focused prompt
- Analysis stored per uploaded file (`visual_analysis` column on `uploaded_files`)
- Analysis injected into AI system prompt when the project has relevant uploaded files
- Image files (PNG/JPG/etc.) also gain Visual Analysis (they already go through OCR; now they additionally go through Vision API for component extraction)
- UI: upload response includes `visualAnalysisReady: true/false`; Design Panel shows summary

**Non-Goals:**
- Real-time streaming of analysis progress (analysis runs async post-upload, but response waits for it synchronously — consistent with existing art style detection)
- PPTX/DOCX visual analysis (already handled by art style detection; out of scope here)
- Per-page annotation or page selection UI
- Replacing or modifying existing art style detection for PPTX/DOCX

## Decisions

### 1. PDF rendering: `pdfjs-dist` + `canvas`, not Ghostscript

**Decision**: Use `pdfjs-dist` (Mozilla PDF.js) with the `canvas` npm package for Node.js rendering.

**Why**: Ghostscript/ImageMagick (`pdf2pic`) require external native binaries that are not guaranteed on the deployment environment. `pdfjs-dist` is a pure JS library (with optional `canvas` native addon for actual rendering); `canvas` has prebuilt binaries for Windows/Linux/macOS via `node-pre-gyp`. This avoids system dependency issues.

**Alternative considered**: `pdf-to-img` (wraps pdfjs-dist) — simpler API but less control over page selection and resolution. We use `pdfjs-dist` directly for flexibility.

### 2. Page limit: 6 pages

**Decision**: Analyze up to 6 pages per PDF (pages 1–6).

**Why**: Vision API costs scale with images. Design specs typically have 1–10 pages; the first 6 capture most component patterns. Users can upload multiple files if a spec has more relevant pages. `detail: 'low'` is used (consistent with art style detection) to control token cost.

### 3. Storage: `visual_analysis` column on `uploaded_files`, not a separate table

**Decision**: Add `visual_analysis TEXT` and `visual_analysis_at TEXT` columns to `uploaded_files`.

**Why**: Analysis belongs to a specific uploaded file. A separate table adds join complexity with no benefit — there's one analysis per file. If a user re-uploads, they get a new file row with fresh analysis.

### 4. Prompt injection: append `=== DESIGN SPEC ANALYSIS ===` block in chat.ts

**Decision**: Fetch all `visual_analysis` values from `uploaded_files WHERE project_id = ?` and append a single block to the system prompt.

**Why**: Consistent with existing injection pattern. Multiple design files are concatenated under one block. The block uses imperative language ("Your components MUST follow these patterns") and is positioned after the project design block so it can refine/override generic design token descriptions.

### 5. Vision prompt: component-level, not style summary

**Decision**: Use a detailed structured prompt that asks for: color palette (hex), card layout structure, search bar design, tag/chip style, navigation pattern, typography sizes, spacing/grid observations.

**Why**: The existing `analyzeArtStyle` prompt asks for "1-2 sentences" of general style — too coarse for prototype fidelity. The new prompt extracts actionable component specifications that AI can follow literally when writing HTML/CSS.

## Risks / Trade-offs

- **`canvas` native build may fail on some systems** → Mitigation: catch render errors gracefully; fall back to text-only extraction (existing behavior). Log warning. Do not block upload.
- **Vision API cost** → Mitigation: `detail: 'low'`, max 6 pages, skip if no API key, skip if `visual_analysis` already populated for that file.
- **Analysis adds latency to upload (~5–15s for 6 pages)** → Mitigation: consistent with existing PPTX art style path. Acceptable trade-off; user sees analysis immediately after upload completes.
- **Analysis may be generic for complex multi-column PDFs** → Mitigation: prompt asks for structured JSON-like output that AI can use even with partial information.

## Migration Plan

1. Add DB migration: `ALTER TABLE uploaded_files ADD COLUMN visual_analysis TEXT; ALTER TABLE uploaded_files ADD COLUMN visual_analysis_at TEXT;`
2. Deploy server changes — existing uploaded files will have `visual_analysis = NULL` (no backfill needed; users can re-upload if desired)
3. No client-breaking changes — upload API response gains optional `visualAnalysisReady` field
