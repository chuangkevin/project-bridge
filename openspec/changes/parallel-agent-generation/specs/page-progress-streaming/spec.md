## ADDED Requirements

### Requirement: SSE events report per-page generation progress
The system SHALL send structured SSE events during parallel generation indicating which phase is active and individual page status.

#### Scenario: Normal 3-page generation flow
- **WHEN** user triggers generation of a 3-page prototype
- **THEN** SSE stream emits events in order: planning phase → token compilation → per-page started/done events → assembling phase → final done event with HTML

#### Scenario: Client receives page-level progress
- **WHEN** sub-agent for "選擇範本" completes before "選擇物件"
- **THEN** client receives `{"phase":"generating","page":"選擇範本","status":"done"}` immediately, without waiting for other pages

### Requirement: Frontend displays page-level progress indicators
The system SHALL show a progress panel in the ChatPanel during generation with individual status per page (pending/generating/done/error).

#### Scenario: User sees progress during generation
- **WHEN** generation is in progress with 3 pages
- **THEN** UI shows a panel with 3 rows, each showing page name and status icon (spinner for generating, checkmark for done, X for error)

#### Scenario: Generation completes
- **WHEN** all pages are done and assembly completes
- **THEN** progress panel transitions to showing the final prototype in PreviewPanel as usual

### Requirement: Fallback for single-call generation
The system SHALL maintain backward-compatible SSE format when using single-call generation (≤2 pages), streaming raw content tokens as before.

#### Scenario: 1-page prototype generation
- **WHEN** analysis shows only 1 page
- **THEN** system uses current single-call generation with existing SSE content streaming (no phase events)
