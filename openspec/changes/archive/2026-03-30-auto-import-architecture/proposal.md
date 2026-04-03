## Why

Users currently must manually recreate architecture nodes after uploading and analyzing spec documents. The analysis agent already extracts pages, components, navigation flows, and business rules into `analysis_result`, but this structured data sits unused in the database. Users must re-enter page names, viewports, components, and edges by hand in the ArchFlowchart -- a tedious and error-prone process that defeats the purpose of automated analysis.

## What Changes

- Add a server endpoint `GET /api/projects/:id/analysis-summary` that merges `analysis_result` from all uploaded files for a project into a single consolidated summary (pages, components, navigation, rules)
- Add a "Import from Analysis" button in `ArchFlowchart` toolbar that fetches the summary and auto-creates `ArchNode` pages with positions, viewports, components, and `ArchEdge` navigation edges
- When existing architecture data is present, prompt the user to choose merge (add missing pages/edges) or replace (overwrite all)
- Map `AnalysisPage.components` to `ArchComponent` objects with auto-generated IDs
- Map `AnalysisPage.navigationTo` to `ArchEdge` entries between page nodes
- Store `AnalysisPage.businessRules` in component descriptions

## Capabilities

### New Capabilities
- `analysis-import`: Server-side analysis summary aggregation endpoint and client-side one-click architecture import from analysis results

### Modified Capabilities
_None -- this is additive functionality; existing architecture editing behavior is unchanged._

## Impact

- **Server**: New route handler in `packages/server/src/routes/` for `GET /api/projects/:id/analysis-summary`, querying `uploaded_files` table for `analysis_result` JSON
- **Client**: Modified `ArchFlowchart.tsx` with new toolbar button and import logic; uses `useArchStore.patchArchData` to persist
- **Database**: Read-only access to existing `uploaded_files.analysis_result` column -- no schema changes
- **Dependencies**: None new
