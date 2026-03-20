## Context

project-bridge generates interactive HTML prototypes from design specs. Users can annotate elements (via `data-bridge-id`) and add spec notes, but there is no way to define which UI elements connect to backend API endpoints. Product managers specify interactive behaviors in chat, but this information is lost — backend engineers must manually trace chat history to understand which buttons call which endpoints, what parameters are expected, and what response shapes to implement. Additionally, form elements lack validation metadata, so constraint rules (e.g., "must be positive number, range 0-10000") are never communicated from design to development.

Current infrastructure: PreviewPanel renders HTML in an iframe with a bridge script that supports annotation mode (click element -> open annotation editor). Elements have `data-bridge-id` attributes. DB uses better-sqlite3 with sequential SQL migrations. Routes follow Express Router pattern (one file per domain). Chat.ts assembles a system prompt with `=== DESIGN SPEC ANALYSIS ===` blocks and sends to Gemini for generation.

## Goals / Non-Goals

**Goals:**
- Let users click any prototype element to bind an API endpoint (method, URL, params, response schema, field mappings)
- Capture inter-component dependencies (dropdown A onChange -> reload dropdown B)
- Let users define input validation constraints on form elements (type, min/max, regex, required)
- Store constraints as `data-constraint-*` attributes, inject into generation prompts
- Extend design-spec-analysis to auto-extract constraint descriptions from spec documents
- Export all bindings and constraints as structured API documentation
- Persist everything in SQLite alongside existing project data

**Non-Goals:**
- Actual API call execution or mock server (this is documentation, not runtime)
- Swagger/OpenAPI import/export (structured JSON export only)
- Real-time collaboration on bindings
- Automated API test generation
- Backend code scaffolding from bindings

## Decisions

### D1: New interaction mode in PreviewPanel — "API Binding" mode

**Decision**: Add a third interaction mode toggle to PreviewPanel alongside existing annotation mode. When API binding mode is active, clicking an element opens the ApiBindingPanel instead of the annotation editor.

**Why**: Reuses the existing bridge script infrastructure (`data-bridge-id`, `element-click` postMessage). The mode toggle prevents ambiguity — users explicitly choose whether they're annotating or binding APIs.

**Implementation**: PreviewPanel already handles `annotationMode` prop and forwards click events. Add an `interactionMode` prop with values `'browse' | 'annotate' | 'api-binding'`. The parent (WorkspacePage) controls which mode is active via a toolbar toggle.

**Alternative considered**: Separate "API Binding" tab/page — rejected because bindings need to be spatially associated with prototype elements.

### D2: ApiBindingPanel as a slide-out panel

**Decision**: When an element is clicked in API binding mode, a side panel slides in showing the binding form for that `bridge_id`. The form has: HTTP method selector (GET/POST/PUT/DELETE), URL path input, request parameters table (name/type/required rows), response schema JSON editor, and field mappings table (response field path -> child bridge-id).

**Why**: Same UX pattern as the existing AnnotationEditor — familiar interaction. The panel allows editing without obscuring the prototype.

### D3: Field mappings stored as JSON column in api_bindings

**Decision**: The `api_bindings` table has a `field_mappings` TEXT column storing JSON like `[{"responseField": "items[].price", "targetBridgeId": "table-cell-price"}]`.

**Why**: Field mappings are variable-length and nested. A JSON column avoids a separate join table for what is essentially a detail of a single binding. The data is always read/written as a unit with the binding.

**Alternative considered**: Separate `field_mappings` table with FK to `api_bindings` — rejected because field mappings are never queried independently; they're always part of the binding payload.

### D4: Component dependencies as a separate table

**Decision**: `component_dependencies` table with columns: `id, project_id, source_bridge_id, target_bridge_id, trigger, action, created_at, updated_at`. Each row represents one dependency edge.

**Why**: Dependencies are a graph structure (many-to-many between components). A dedicated table allows querying "what depends on X?" and "what does X depend on?" efficiently. The export feature needs to traverse these edges.

### D5: Element constraints stored in dedicated table + data attributes

**Decision**: `element_constraints` table stores validation rules per element. Constraints are also rendered as `data-constraint-*` attributes on elements in the HTML. The generation prompt includes an `=== INPUT CONSTRAINTS ===` block when constraints are detected from design specs.

**Why**: Dual storage serves two purposes — the table is the source of truth for CRUD operations and export, while the data attributes allow the prototype HTML itself to carry constraint metadata (useful for frontend developers inspecting the prototype).

### D6: Design-spec-analysis extended with constraint extraction

**Decision**: The existing `designSpecAnalyzer` prompt is extended to detect constraint descriptions in design specs (e.g., "坪數 field: positive number, 0-10000") and include them in the structured analysis output under a new `inputConstraints` array.

**Why**: Many design specs already describe validation rules in natural language. Extracting these during analysis means they can be auto-populated as element constraints and injected into the generation prompt so the AI generates HTML with correct `data-constraint-*` attributes from the start.

### D7: Export as structured JSON

**Decision**: `GET /api/projects/:id/api-bindings/export` returns a JSON document grouping all bindings by page, with field mappings, dependencies, and constraints included per element.

**Why**: JSON is machine-readable and can be consumed by backend teams' tooling. Markdown or PDF export can be layered on later.

## Risks / Trade-offs

- **[Risk] bridge-id stability** — If a prototype is regenerated, `data-bridge-id` values change and existing bindings become orphaned. Mitigation: warn user that regenerating will invalidate bindings; future work could add bridge-id persistence across regenerations.
- **[Risk] Field mapping target validation** — Users may map response fields to bridge-ids that don't exist in the current HTML. Mitigation: validate against current HTML on save, show warning (non-blocking).
- **[Risk] Constraint extraction accuracy** — AI may miss or misinterpret constraint descriptions in specs. Mitigation: extracted constraints are suggestions; users can manually edit/override via the ConstraintPanel.
- **[Trade-off] JSON column for field_mappings** — Not queryable via SQL. Acceptable because field mappings are never queried independently.

## Open Questions

- Should bindings be versioned alongside prototype versions? (Probably yes in future, but out of scope for this change)
