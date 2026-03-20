## Why

After document analysis completes, users have no way to see what the AI understood from their uploaded specs/designs. The analysis result is stored in the database but invisible to the user until it silently influences prototype generation. This lack of transparency means users cannot catch misinterpretations (wrong page names, missing components, incorrect navigation flows) before generation, leading to wasted generation cycles and frustration.

## What Changes

- Add a new `AnalysisPreviewPanel` React component that displays the full analysis result in a structured, readable format
- Show document type, pages found (with component counts), business rules, navigation flow (text diagram), global rules, and skills output (explore insights, UX review, design proposal)
- Make the panel accessible via file chip click in the upload area and via a dedicated tab
- Read data from the existing `GET /api/projects/:id/upload/:fileId/analysis-status` endpoint (which already returns the `result` field)
- Provide inline editing capability so users can correct page names, add/remove components, and fix navigation before generation

## Capabilities

### New Capabilities
- `analysis-preview`: Client-side panel for displaying, reviewing, and editing document analysis results before prototype generation

### Modified Capabilities
_None -- the analysis-status endpoint already returns the needed data._

## Impact

- **Client**: New `AnalysisPreviewPanel.tsx` component; modified upload area to open panel on file chip click; new tab option in project view
- **Server**: No changes needed -- existing `/api/projects/:id/upload/:fileId/analysis-status` already returns `result` with full `DocumentAnalysisResult`
- **Dependencies**: None new
