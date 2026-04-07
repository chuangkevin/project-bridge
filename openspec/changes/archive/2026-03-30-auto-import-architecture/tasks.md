## 1. Server: Analysis Summary Endpoint

- [x] 1.1 Add `GET /api/projects/:id/analysis-summary` route that queries all `uploaded_files` with `analysis_status = 'done'` for the project, parses their `analysis_result` JSON, and merges pages by name (union components, keep first viewport)
- [x] 1.2 Return merged `{ pages, globalRules, documentTypes }` response; return empty arrays if no analysis found
- [x] 1.3 Write Playwright test: upload a file, wait for analysis, call the endpoint, verify response structure
- [x] 1.4 Commit: "feat: add GET /api/projects/:id/analysis-summary endpoint"

## 2. Client: Import Button Visibility

- [x] 2.1 Add state `hasAnalysis` to ArchFlowchart that fetches `/api/projects/:id/analysis-summary` on mount and checks if `pages.length > 0`
- [x] 2.2 Render "Import from Analysis" button in toolbar only when `hasAnalysis` is true
- [x] 2.3 Write Playwright test: verify button appears when project has analyzed files, hidden when none
- [x] 2.4 Commit: "feat: add conditional import-from-analysis button in ArchFlowchart toolbar"

## 3. Client: Import Logic (Nodes + Edges)

- [x] 3.1 Implement `importFromAnalysis(summary)` function that converts analysis pages to ArchNode array with grid positioning (3 columns, 250px spacing), maps components to ArchComponent objects, and creates ArchEdge entries from navigationTo arrays
- [x] 3.2 Map business rules to component descriptions; map viewport values ('desktop'|'mobile'|'both' -> 'desktop'|'mobile'|null)
- [x] 3.3 Call `patchArchData` to persist the imported architecture
- [x] 3.4 Write Playwright test: click import button, verify nodes appear in flowchart with correct names and edges
- [x] 3.5 Commit: "feat: implement one-click architecture import from analysis results"

## 4. Client: Merge/Replace Dialog

- [x] 4.1 When existing nodes are present, show a confirmation dialog with Merge/Replace/Cancel options before importing
- [x] 4.2 Implement merge logic: skip pages whose names already exist in current nodes, add only new ones and their edges
- [x] 4.3 Implement replace logic: clear all existing nodes/edges, then import fresh
- [x] 4.4 Write Playwright test: create manual architecture, click import, test merge (existing pages preserved, new added) and replace (all replaced) flows
- [x] 4.5 Commit: "feat: add merge/replace dialog for architecture import when nodes exist"
