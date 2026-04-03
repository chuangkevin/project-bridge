## ADDED Requirements

### Requirement: Analysis preview panel displays structured analysis result
The system SHALL provide an `AnalysisPreviewPanel` component that displays a `DocumentAnalysisResult` in a structured, human-readable format. The panel SHALL show: document type badge, summary text, a collapsible section per page (showing name, viewport, component count, component list, business rules, interactions, data fields, and navigationTo targets), global rules list, and skills output sections (explore insights, UX review score/issues, design proposal direction) when available.

#### Scenario: Panel displays complete analysis for a spec document
- **WHEN** the panel receives an analysis result with documentType "spec", 3 pages with components and business rules, and skills output
- **THEN** the panel renders the document type as "spec", shows 3 collapsible page sections each listing their components and rules, displays global rules, and renders explore/uxReview/designProposal sections

#### Scenario: Panel handles analysis with no skills output
- **WHEN** the analysis result has pages but no explore, uxReview, or designProposal fields
- **THEN** the skills sections are not rendered and no errors occur

#### Scenario: Panel handles design/screenshot type with layout info
- **WHEN** the analysis result has documentType "design" with pages containing layout descriptions
- **THEN** each page section displays the layout description

### Requirement: Navigation flow text diagram
The panel SHALL display a text-based navigation flow diagram showing all page-to-page navigation relationships extracted from `pages[].navigationTo`. The diagram SHALL use arrow notation (e.g., "Home -> Login, Dashboard") grouped by source page.

#### Scenario: Navigation diagram shows all flows
- **WHEN** the analysis has pages Home (navigates to Login, Dashboard), Login (navigates to Dashboard), and Dashboard (no navigation)
- **THEN** the navigation section displays "Home -> Login, Dashboard" and "Login -> Dashboard" and "Dashboard: (no outgoing navigation)"

### Requirement: Panel accessible from file chip click
The system SHALL open the AnalysisPreviewPanel when a user clicks on a file chip in the upload area, fetching analysis data from `GET /api/projects/:id/upload/:fileId/analysis-status` and displaying the `result` field.

#### Scenario: Clicking file chip opens analysis preview
- **WHEN** the user clicks on an uploaded file chip that has `analysis_status = 'done'`
- **THEN** the AnalysisPreviewPanel slides open displaying that file's analysis result

#### Scenario: Clicking file chip with pending analysis shows status
- **WHEN** the user clicks on a file chip that has `analysis_status = 'running'`
- **THEN** the panel shows an "Analysis in progress..." message with a spinner

### Requirement: Panel accessible from dedicated toggle
The system SHALL provide a toggle button or tab to open the AnalysisPreviewPanel independently of file chip clicks, showing analysis from the most recently analyzed file or a file selector if multiple files exist.

#### Scenario: Toggle opens panel with most recent analysis
- **WHEN** the user clicks the analysis preview toggle and the project has 2 analyzed files
- **THEN** the panel opens showing the most recently analyzed file's results, with a selector to switch between files

### Requirement: Inline editing of analysis fields
The panel SHALL allow users to edit page names, add/remove components from a page's component list, and modify navigationTo targets. Edits SHALL be stored in local component state and reflected immediately in the panel display.

#### Scenario: User renames a page
- **WHEN** the user clicks on a page name in the panel and types a new name
- **THEN** the page name updates in the panel display immediately

#### Scenario: User removes a component
- **WHEN** the user clicks the remove button next to a component in a page's component list
- **THEN** the component is removed from the displayed list
