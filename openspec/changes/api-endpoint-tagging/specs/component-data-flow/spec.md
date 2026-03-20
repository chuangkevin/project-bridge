## ADDED Requirements

### Requirement: Define inter-component dependency edges
The system SHALL allow users to define dependency relationships between components: a source element triggers an action on a target element. Each dependency is an edge with: `source_bridge_id`, `target_bridge_id`, `trigger` (e.g., "onChange", "onClick"), and `action` (e.g., "reload with ?city={value}").

#### Scenario: Create dependency between dropdowns
- **WHEN** user defines dependency: source="city-select", target="district-select", trigger="onChange", action="reload with ?city={value}"
- **THEN** a new row is inserted into `component_dependencies` with these values

#### Scenario: Multiple dependencies from same source
- **WHEN** "city-select" has dependencies to both "district-select" and "price-table"
- **THEN** two separate dependency rows exist, both with source_bridge_id="city-select"

### Requirement: Persist dependencies in component_dependencies table
The system SHALL store component dependencies in the `component_dependencies` table with columns: `id` (UUID), `project_id`, `source_bridge_id`, `target_bridge_id`, `trigger`, `action`, `created_at`, `updated_at`.

#### Scenario: DB migration creates table
- **WHEN** server starts and migration has not been applied
- **THEN** the `component_dependencies` table is created with all specified columns

### Requirement: CRUD API routes for dependencies
The system SHALL expose:
- `GET /api/projects/:id/component-dependencies` — list all dependencies for project
- `POST /api/projects/:id/component-dependencies` — create dependency
- `PUT /api/projects/:id/component-dependencies/:depId` — update dependency
- `DELETE /api/projects/:id/component-dependencies/:depId` — delete dependency

#### Scenario: List dependencies for project
- **WHEN** GET is called for a project with 3 dependencies
- **THEN** response is a JSON array of 3 dependency objects with all fields

#### Scenario: Create dependency with validation
- **WHEN** POST is called without `source_bridge_id`
- **THEN** response is 400 with error "sourceBridgeId is required"

### Requirement: Dependency editor in ApiBindingPanel
The ApiBindingPanel SHALL include a "Dependencies" section where users can add/edit/remove outgoing dependencies from the selected element. Each dependency row has: target bridge-id (text input), trigger (dropdown: onChange, onClick, onSubmit, onFocus, custom), and action (text input describing the effect).

#### Scenario: Add dependency from binding panel
- **WHEN** user is editing binding for "city-select" and adds a dependency row with target="district-select", trigger="onChange", action="reload with ?city={value}"
- **THEN** the dependency is saved when the binding is saved

#### Scenario: View incoming dependencies
- **WHEN** user opens binding panel for "district-select"
- **THEN** the panel shows a read-only "Depends On" section listing "city-select (onChange)" as an incoming dependency

### Requirement: Dependencies included in export
The export endpoint SHALL include component dependencies alongside API bindings. Each binding in the export includes an array of outgoing dependencies and incoming dependencies.

#### Scenario: Export includes dependency graph
- **WHEN** project has dependency: city-select -> district-select (onChange, reload)
- **THEN** export JSON includes the dependency under the city-select binding's `outgoingDependencies` array and under district-select's `incomingDependencies` array
