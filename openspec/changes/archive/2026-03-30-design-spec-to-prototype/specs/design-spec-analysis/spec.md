## ADDED Requirements

### Requirement: PDF pages are rendered as images and analyzed by Vision API
When a PDF file is uploaded to a project, the system SHALL render each page (up to 6 pages) as a PNG image and send each image to the Vision API (gpt-4o) for component-level visual analysis. The analysis SHALL be stored in the `visual_analysis` column of the `uploaded_files` table. If the Vision API key is unavailable or rendering fails, the system SHALL continue without visual analysis (graceful degradation — text extraction still succeeds).

#### Scenario: PDF upload with API key available triggers visual analysis
- **WHEN** a user uploads a PDF file to a project that has an OpenAI API key configured
- **THEN** the server renders up to 6 pages as PNG images, analyzes them via Vision API, stores the resulting analysis text in `visual_analysis`, and returns `visualAnalysisReady: true` in the upload response

#### Scenario: PDF upload without API key skips analysis
- **WHEN** a user uploads a PDF file and no OpenAI API key is configured
- **THEN** the upload succeeds with text extraction only, `visual_analysis` remains null, and `visualAnalysisReady: false` is returned

#### Scenario: PDF rendering fails gracefully
- **WHEN** PDF page rendering encounters an error (e.g., corrupted PDF, canvas build unavailable)
- **THEN** the upload still succeeds with text-only extraction, visual analysis is skipped, and an error is logged server-side

### Requirement: Image files are analyzed by Vision API for component patterns
When a PNG, JPG, or WebP image is uploaded to a project, the system SHALL send it to the Vision API (gpt-4o) using the component-analysis prompt and store the result in `visual_analysis`. OCR text extraction SHALL still run as before.

#### Scenario: Image upload with API key triggers visual analysis
- **WHEN** a user uploads a PNG, JPG, or WebP image
- **THEN** the image is sent to Vision API with the component-analysis prompt, and the result is stored as `visual_analysis`

#### Scenario: Image upload without API key falls back to OCR only
- **WHEN** a user uploads an image and no OpenAI API key is configured
- **THEN** OCR text extraction runs normally and `visualAnalysisReady: false` is returned

### Requirement: Visual analysis uses a structured component-extraction prompt
The Vision API prompt for design spec analysis SHALL request structured output covering: dominant color palette (hex values), card/list item layout description, search bar design, tag/chip style, navigation pattern, typography scale observations, and spacing/grid observations. The response SHALL be stored as-is (plain text or JSON-like structured text) without post-processing.

#### Scenario: Analysis output contains component descriptions
- **WHEN** Vision API analyzes a design spec image with UI components
- **THEN** the stored `visual_analysis` text contains descriptions of at least color palette and one component type (card, search bar, or tag)

### Requirement: Design spec analysis is injected into AI prototype generation prompt
When generating a prototype for a project that has uploaded files with non-null `visual_analysis`, the system SHALL append a `=== DESIGN SPEC ANALYSIS ===` block to the effective system prompt. The block SHALL include all `visual_analysis` values from uploaded files for that project, separated by document name headers. The block SHALL appear after the project design block and before the art style block.

#### Scenario: Project with analyzed design spec generates component-aware prototype
- **WHEN** a project has an uploaded file with `visual_analysis` populated and the user requests prototype generation
- **THEN** the AI system prompt includes a `=== DESIGN SPEC ANALYSIS ===` section with the component pattern descriptions

#### Scenario: Project without analyzed files has no design spec block
- **WHEN** a project has no uploaded files, or all uploaded files have `visual_analysis = null`
- **THEN** the `=== DESIGN SPEC ANALYSIS ===` block is NOT appended to the system prompt

### Requirement: Upload API response exposes visual analysis status
The `POST /api/projects/:id/upload` response SHALL include a `visualAnalysisReady` boolean field indicating whether visual analysis was performed and stored for the uploaded file.

#### Scenario: Upload response includes visual analysis status
- **WHEN** a file upload completes
- **THEN** the JSON response body contains a `visualAnalysisReady` field set to `true` if analysis was stored, or `false` if it was skipped

### Requirement: DB schema supports visual analysis storage
The `uploaded_files` table SHALL have a `visual_analysis TEXT` column (nullable) and a `visual_analysis_at TEXT` column (nullable) storing the ISO timestamp of when analysis was performed.

#### Scenario: New column exists after migration
- **WHEN** the server starts and DB migration runs
- **THEN** the `uploaded_files` table contains `visual_analysis` and `visual_analysis_at` columns
