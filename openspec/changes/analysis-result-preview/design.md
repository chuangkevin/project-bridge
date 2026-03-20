## Context

The document analysis agent (`documentAnalysisAgent.ts`) produces `DocumentAnalysisResult` containing: documentType, pages (with name, viewport, components, interactions, dataFields, businessRules, navigationTo, layout), globalStyles, globalRules, summary, and optional skills output (explore, uxReview, designProposal). This is stored as JSON in `uploaded_files.analysis_result` and exposed via the existing analysis-status endpoint.

Currently, this data is only consumed internally by the generation pipeline. Users cannot inspect, verify, or correct it.

## Goals / Non-Goals

**Goals:**
- Display full analysis results in a clear, structured UI panel
- Allow users to review analysis before triggering generation
- Support inline editing of key fields (page names, components, navigation)
- Show skills output (explore, UX review, design proposal) when available

**Non-Goals:**
- Re-running analysis from the panel (users re-upload to re-analyze)
- Saving edits back to the server (edits are local overrides for the current session; persistent editing is a future feature)
- Replacing the existing file upload UI

## Decisions

### 1. Panel as a slide-out drawer, not a modal
**Rationale**: A drawer allows the user to keep the main project view visible for context while reviewing analysis. Modals block interaction and feel heavy for a read-mostly view.
**Alternative**: Full-page dedicated tab. Rejected because it requires navigation away from the upload/architecture workflow.

### 2. Navigation flow displayed as ASCII-style text diagram
**Rationale**: Building a visual graph for navigation in the preview panel would duplicate ArchFlowchart functionality. A simple text representation (`Home -> Login -> Dashboard`) is lightweight and sufficient for review purposes.
**Alternative**: Mini ReactFlow graph. Rejected as too heavy for a preview panel; users can import to architecture for the full graph experience.

### 3. Inline editing uses local state only (no server persist)
**Rationale**: This keeps the feature simple for v1. Edits affect only the current session's view and the data passed to generation. Persisting edits would require a new PATCH endpoint and conflict resolution with re-analysis.
**Alternative**: PATCH endpoint to save edits. Deferred to future iteration.

### 4. Entry points: file chip click + dedicated panel toggle
**Rationale**: File chip click provides contextual access (see analysis for a specific file). A toolbar toggle provides global access. Both map to common user workflows.

## Risks / Trade-offs

- [Risk] Analysis result JSON may be large for documents with many pages -> Mitigation: Collapsible sections per page; lazy rendering
- [Risk] Skills output (explore, uxReview, designProposal) has varied structure -> Mitigation: Render each skill section with type-specific formatters; graceful fallback for missing fields
- [Risk] Local-only edits may confuse users who expect persistence -> Mitigation: Clear visual indicator ("edits are session-only") and save button placeholder for future
