## Context

The document analysis pipeline (`documentAnalysisAgent.ts`) already produces structured `DocumentAnalysisResult` with pages, components, navigation, and business rules. This data is stored as JSON in `uploaded_files.analysis_result`. The architecture editor (`ArchFlowchart.tsx`) uses `useArchStore` to manage `ArchData` with nodes and edges, persisted via `PATCH /api/projects/:id/architecture`.

Currently there is no bridge between these two data models. Users must manually create pages and edges even though the analysis has already identified them.

## Goals / Non-Goals

**Goals:**
- Provide a single API endpoint that aggregates analysis results across all uploaded files for a project
- Enable one-click import of analyzed architecture into the flowchart editor
- Handle merge vs. replace when architecture already has nodes
- Map all analysis fields (pages, components, navigation, viewport, business rules) to ArchData structures

**Non-Goals:**
- Real-time sync between analysis and architecture (this is a one-time import action)
- Editing analysis results before import (covered by the separate `analysis-result-preview` change)
- Supporting partial imports (e.g., importing only specific pages) -- future enhancement

## Decisions

### 1. Server endpoint returns merged analysis, not raw per-file data
**Rationale**: Multiple uploaded files may describe the same pages (e.g., a spec PDF and a design screenshot). The server merges by page name, combining components and deduplicating, so the client receives a single clean page list.
**Alternative**: Return per-file results and let the client merge. Rejected because merge logic benefits from server-side deduplication and the client should stay simple.

### 2. Auto-layout uses grid positioning
**Rationale**: Pages are positioned in a grid pattern (3 columns, 250px spacing) rather than requiring a layout algorithm. This is simple, predictable, and users can rearrange after import.
**Alternative**: Force-directed graph layout. Rejected as overkill for typical 3-8 page prototypes and adds a dependency.

### 3. Merge/replace dialog on client side
**Rationale**: When `archData.nodes.length > 0`, show a confirm dialog with three options: Merge (add new pages, skip duplicates), Replace (clear and reimport), Cancel. This keeps the decision with the user.
**Alternative**: Always merge. Rejected because users may want a clean slate after re-analyzing documents.

### 4. Component ID generation uses `comp-{pageIndex}-{compIndex}` pattern
**Rationale**: Deterministic IDs allow re-import to match existing components. Using UUIDs would create duplicates on every import.

## Risks / Trade-offs

- [Risk] Analysis results from different files may have conflicting page names or component lists -> Mitigation: Merge by page name, union components, keep first viewport value
- [Risk] Large analysis results with many pages could create a cluttered flowchart -> Mitigation: Grid layout with reasonable spacing; user can rearrange
- [Risk] Business rules stored in component descriptions may be truncated for long rules -> Mitigation: Concatenate with newlines, cap at 500 chars per component description
