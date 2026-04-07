## ADDED Requirements

### Requirement: Click element in API binding mode to open binding panel
When the user clicks a prototype element with a `data-bridge-id` while in API binding mode, the system SHALL open an ApiBindingPanel pre-populated with any existing binding for that bridge-id, or an empty form for a new binding.

#### Scenario: Click element with no existing binding
- **WHEN** user is in API binding mode and clicks an element with `data-bridge-id="submit-btn"`
- **THEN** the ApiBindingPanel opens with an empty form showing fields for: HTTP method (default GET), URL path, request parameters, response schema, and field mappings

#### Scenario: Click element with existing binding
- **WHEN** user is in API binding mode and clicks an element that already has a binding saved
- **THEN** the ApiBindingPanel opens pre-populated with the stored method, URL, params, response schema, and field mappings

### Requirement: Save API binding to database
The system SHALL persist API bindings in the `api_bindings` table with columns: `id` (UUID), `project_id`, `bridge_id`, `method` (GET/POST/PUT/DELETE), `url` (path string), `params` (JSON array of {name, type, required}), `response_schema` (JSON string), `field_mappings` (JSON array of {responseField, targetBridgeId}), `created_at`, `updated_at`.

#### Scenario: Create new binding
- **WHEN** user fills in method=POST, url="/api/objects/batch", adds params [{name:"ids", type:"array", required:true}], and saves
- **THEN** a new row is inserted into `api_bindings` with the provided values and the element's bridge-id
- **AND** the API returns the created binding with its generated UUID

#### Scenario: Update existing binding
- **WHEN** user modifies the URL of an existing binding from "/api/cities" to "/api/cities?region=north" and saves
- **THEN** the existing row in `api_bindings` is updated with the new URL and `updated_at` timestamp

#### Scenario: Delete binding
- **WHEN** user clicks "Remove Binding" on an existing binding
- **THEN** the row is deleted from `api_bindings`
- **AND** any `component_dependencies` referencing this bridge-id as source or target are also deleted

### Requirement: CRUD API routes for bindings
The system SHALL expose REST endpoints for managing API bindings:
- `GET /api/projects/:id/api-bindings` — list all bindings for project
- `POST /api/projects/:id/api-bindings` — create binding
- `PUT /api/projects/:id/api-bindings/:bindingId` — update binding
- `DELETE /api/projects/:id/api-bindings/:bindingId` — delete binding

#### Scenario: List bindings for project
- **WHEN** GET `/api/projects/abc-123/api-bindings` is called
- **THEN** response is a JSON array of all bindings for that project, each with id, bridge_id, method, url, params, response_schema, field_mappings

#### Scenario: Create binding with validation
- **WHEN** POST is called without required field `bridge_id`
- **THEN** response is 400 with error message "bridgeId is required"

### Requirement: Field mappings define response-to-element relationships
Each binding MAY include a `field_mappings` JSON array where each entry maps a response JSON path (e.g., `items[].price`) to a child element's `data-bridge-id` (e.g., `table-cell-price`). The ApiBindingPanel SHALL provide a UI for adding/removing field mapping rows.

#### Scenario: Add field mapping
- **WHEN** user adds a field mapping: responseField="items[].name", targetBridgeId="list-item-name"
- **THEN** the mapping is included in the field_mappings JSON when the binding is saved

#### Scenario: Empty field mappings
- **WHEN** user saves a binding without defining any field mappings
- **THEN** field_mappings is stored as an empty JSON array `[]`

### Requirement: Export bindings as structured documentation
The system SHALL expose `GET /api/projects/:id/api-bindings/export` which returns a JSON document grouping all bindings by page, including field mappings, associated component dependencies, and element constraints.

#### Scenario: Export project with 3 bindings across 2 pages
- **WHEN** export is called for a project with bindings on page-1 and page-2 elements
- **THEN** response is a JSON object with pages as keys, each containing an array of bindings with full detail (method, url, params, response_schema, field_mappings, dependencies, constraints)

#### Scenario: Export project with no bindings
- **WHEN** export is called for a project with no bindings
- **THEN** response is a JSON object with an empty pages object and metadata

### Requirement: DB migration creates api_bindings table
The system SHALL create the `api_bindings` table via a new SQL migration file. The table schema: `id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), bridge_id TEXT NOT NULL, method TEXT NOT NULL DEFAULT 'GET', url TEXT NOT NULL DEFAULT '', params TEXT NOT NULL DEFAULT '[]', response_schema TEXT NOT NULL DEFAULT '{}', field_mappings TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL`.

#### Scenario: Migration runs on server start
- **WHEN** server starts and migration has not been applied
- **THEN** the `api_bindings` table is created with all specified columns
- **AND** the migration is recorded in `_migrations`
