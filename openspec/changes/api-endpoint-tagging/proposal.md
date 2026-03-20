## Why

After a prototype is generated, there is no way for engineers to define which UI elements connect to which backend API endpoints. Product managers and designers specify interactive behaviors in chat, but this information is lost — backend engineers must manually read through chat history or ask follow-up questions to understand which buttons call which endpoints, what parameters are expected, and what response shapes to implement. Additionally, form elements lack any input constraint metadata (e.g., "坪數 must be a positive number"), so validation rules are never communicated from design to development.

## What Changes

- **API Binding UI**: In the prototype preview, users can click any element with a `data-bridge-id` to open an API binding panel. The panel lets them specify HTTP method, URL path, request parameters (name/type/required), and response schema (JSON shape)
- **Component-Level Data Flow**: Each binding defines the granular relationship between a specific UI component and its data source — e.g., "this dropdown loads from GET /api/cities", "this button submits POST /api/objects/batch", "this table cell displays `response.price`". Bindings track: trigger element → API call → which child components render which response fields
- **Component Dependency Graph**: When element A (e.g., city dropdown) changes, it triggers element B (e.g., district dropdown) to reload. These inter-component dependencies are captured as edges: `{ source: 'city-select', target: 'district-select', trigger: 'onChange', action: 'reload with ?city={value}' }`
- **API-UI Mapping Store**: Bindings are persisted per project as a mapping table (`api_bindings`) linking bridge-id to endpoint definitions. Each binding includes: which specific child elements display which response fields (field mapping)
- **Export as API Documentation**: A new export action generates structured documentation listing all bound endpoints grouped by page, with component-level detail: which element triggers the call, which elements render the response, field-by-field mapping, and inter-component dependencies
- **Input Constraint Binding**: Users can click on form elements (inputs, selects, textareas) to define validation rules — constraint type (number, text, date), min/max values, regex patterns, required flag, and custom error messages
- **Component-Level Constraints**: Constraints are stored as `data-constraint-*` attributes on elements (e.g., `data-constraint-type="number"`, `data-constraint-min="0"`, `data-constraint-max="10000"`) and persisted alongside the API binding data
- **Constraint-Aware Generation**: When design reference files specify input constraints (e.g., "坪數 field: positive number, 0-10000"), these constraints are captured during design spec analysis and injected into the generation prompt so that generated prototypes include the correct `data-constraint-*` attributes from the start
- **Constraint Export**: Input constraints are included in the API documentation export alongside endpoint definitions, giving backend engineers a complete picture of both API contracts and validation rules

## Capabilities

### New Capabilities
- `api-endpoint-binding`: Click-to-bind UI that lets users associate API endpoints (method, URL, params, response schema) with prototype elements identified by `data-bridge-id`; includes field-level mapping (which child element displays which response field); bindings stored in `api_bindings` table and exportable as structured API documentation
- `component-data-flow`: Define granular data relationships between components — source element triggers API call, response fields map to specific child elements (e.g., "table-row-price" displays `response.items[].price`). Includes inter-component dependency edges (dropdown A onChange → reload dropdown B with filtered data)
- `input-constraint-binding`: Click-to-configure validation rules on form elements — constraint type, min/max, regex, required flag — stored as `data-constraint-*` data attributes and persisted in `element_constraints` table
- `component-level-constraints`: Design-time constraint definitions settable via clicking form elements in the prototype; stored as data attributes (`data-constraint-type`, `data-constraint-min`, `data-constraint-max`, `data-constraint-pattern`, `data-constraint-required`); included in generation prompts when design references specify them; exported as part of the API-UI mapping documentation

### Modified Capabilities
- `design-spec-analysis`: Analysis prompt extended to detect and extract input constraint descriptions from design specs (e.g., "this field is 坪數, cannot be negative, range 0-10000") and include them in the structured analysis output
- `prototype-preview`: Preview panel gains an "API Binding" interaction mode alongside existing annotation and drag-edit modes; clicking elements in this mode opens the binding panel instead of annotation editor

## Impact

- **Server**: New `api_bindings` and `element_constraints` tables; new routes `GET/POST/PUT/DELETE /api/projects/:id/api-bindings` and `GET/POST/PUT/DELETE /api/projects/:id/element-constraints`; new export route `GET /api/projects/:id/api-bindings/export`; design-spec-analysis prompt updated to extract constraint metadata
- **Client**: New `ApiBindingPanel` component (endpoint form with method/URL/params/response fields); new `ConstraintPanel` component (validation rule editor); PreviewPanel gains API-binding interaction mode toggle; new export button in project toolbar
- **AI prompts**: Design spec analysis prompt gains constraint extraction instructions; generation system prompt gains `=== INPUT CONSTRAINTS ===` block for constraint-aware HTML generation
- **DB schema**: `api_bindings` table (project_id, bridge_id, method, url, params JSON, response_schema JSON, field_mappings JSON — maps response fields to child bridge-ids); `component_dependencies` table (project_id, source_bridge_id, target_bridge_id, trigger, action); `element_constraints` table (project_id, bridge_id, constraint_type, min, max, pattern, required, error_message)
