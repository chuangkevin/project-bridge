## ADDED Requirements

### Requirement: Analysis summary endpoint
The server SHALL provide a `GET /api/projects/:id/analysis-summary` endpoint that returns a merged analysis summary from all uploaded files with `analysis_status = 'done'` for the given project. The response SHALL contain a JSON object with `pages` (array of page objects with name, viewport, components, navigationTo, businessRules), `globalRules` (string array), and `documentTypes` (array of document types found). Pages with the same name across files SHALL be merged by unioning their components and keeping the first non-null viewport.

#### Scenario: Project with analyzed files returns merged summary
- **WHEN** GET `/api/projects/:id/analysis-summary` is called for a project with 2 analyzed files containing overlapping pages
- **THEN** the response status is 200 and the body contains a merged `pages` array with deduplicated page names, combined components, and all navigation edges

#### Scenario: Project with no analyzed files returns empty summary
- **WHEN** GET `/api/projects/:id/analysis-summary` is called for a project with no completed analysis
- **THEN** the response status is 200 and the body contains `{ pages: [], globalRules: [], documentTypes: [] }`

### Requirement: Import button in architecture toolbar
The ArchFlowchart component SHALL display a "Import from Analysis" button in the toolbar. The button SHALL be labeled with Chinese text and only be visible when the project has at least one file with completed analysis.

#### Scenario: Button visible when analysis exists
- **WHEN** the ArchFlowchart renders for a project that has uploaded files with `analysis_status = 'done'`
- **THEN** a button is visible in the toolbar

#### Scenario: Button hidden when no analysis exists
- **WHEN** the ArchFlowchart renders for a project with no completed analysis
- **THEN** the import button is not rendered

### Requirement: One-click architecture import creates nodes and edges
When the user clicks the import button, the system SHALL fetch the analysis summary and create ArchNode entries for each page and ArchEdge entries for each navigation relationship. Each node SHALL have: an auto-generated ID (`page-{timestamp}-{index}`), `nodeType: 'page'`, `name` from analysis page name, `viewport` from analysis viewport (mapped to 'mobile' | 'desktop' | null), grid-positioned coordinates, and `components` array mapped from analysis components to ArchComponent objects. Each ArchComponent SHALL have an auto-generated ID, `name` from the analysis component string, `type` defaulting to 'button', and `description` containing associated business rules.

#### Scenario: Import creates correct nodes from analysis
- **WHEN** the user clicks the import button and the analysis summary contains 3 pages with components
- **THEN** 3 ArchNode objects are created with correct names, viewports, and populated components arrays, and the flowchart displays them in a grid layout

#### Scenario: Import creates navigation edges
- **WHEN** the analysis summary contains pages where page A has `navigationTo: ['B', 'C']`
- **THEN** ArchEdge entries are created from A to B and from A to C, and the flowchart displays connecting arrows

### Requirement: Merge or replace existing architecture
When the user clicks import and architecture nodes already exist, the system SHALL display a confirmation dialog asking the user to choose: Merge (add pages not already present, skip existing page names), Replace (clear all existing nodes/edges and import fresh), or Cancel. The system SHALL NOT silently overwrite existing architecture data.

#### Scenario: Merge adds only new pages
- **WHEN** the user chooses Merge and the existing architecture has pages "Home" and "Login", and the analysis summary has pages "Home", "Login", and "Dashboard"
- **THEN** only "Dashboard" is added as a new node; "Home" and "Login" remain unchanged

#### Scenario: Replace clears and reimports
- **WHEN** the user chooses Replace and the existing architecture has 5 pages
- **THEN** all existing nodes and edges are removed and replaced with the analysis-derived nodes and edges

#### Scenario: Cancel preserves existing architecture
- **WHEN** the user chooses Cancel
- **THEN** no changes are made to the architecture
