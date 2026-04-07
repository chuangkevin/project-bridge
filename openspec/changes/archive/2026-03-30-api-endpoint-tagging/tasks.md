## 1. DB Schema + Migration

- [x] 1.1 Create migration `014_api_endpoint_tagging.sql` with three tables: `api_bindings` (id, project_id, bridge_id, method, url, params JSON, response_schema JSON, field_mappings JSON, created_at, updated_at), `component_dependencies` (id, project_id, source_bridge_id, target_bridge_id, trigger, action, created_at, updated_at), `element_constraints` (id, project_id, bridge_id, constraint_type, min, max, pattern, required, error_message, created_at, updated_at)
- [x] 1.2 Verify migration runs on server start — tables created with correct columns
- [x] 1.3 Write Playwright test: start server, verify tables exist via a test API call or direct DB check
- [x] 1.4 Run test, verify pass, commit: `feat: add DB schema for api_bindings, component_dependencies, element_constraints`

## 2. API Bindings CRUD Routes

- [x] 2.1 Create `packages/server/src/routes/apiBindings.ts` with Express router: GET (list), POST (create), PUT (update), DELETE (delete) for `/api/projects/:id/api-bindings`
- [x] 2.2 Add validation: require bridge_id on POST, require method to be one of GET/POST/PUT/DELETE, validate JSON fields
- [x] 2.3 Register router in server index.ts
- [x] 2.4 Write Playwright test: create binding via POST, list via GET, update via PUT, delete via DELETE — verify each operation
- [x] 2.5 Run test, verify pass, commit: `feat: add CRUD routes for API endpoint bindings`

## 3. Component Dependencies + Constraints CRUD Routes

- [x] 3.1 Create `packages/server/src/routes/componentDependencies.ts` — CRUD for `/api/projects/:id/component-dependencies`
- [x] 3.2 Create `packages/server/src/routes/elementConstraints.ts` — CRUD for `/api/projects/:id/element-constraints` with upsert behavior (one constraint per bridge_id)
- [x] 3.3 Register both routers in server index.ts
- [x] 3.4 Write Playwright test: create dependencies and constraints, verify list, update, delete
- [x] 3.5 Run test, verify pass, commit: `feat: add CRUD routes for component dependencies and element constraints`

## 4. Export Endpoint

- [x] 4.1 Add `GET /api/projects/:id/api-bindings/export` in apiBindings.ts — query all bindings, dependencies, and constraints for the project; group by page (parse bridge-id prefix or use prototype HTML to determine page membership); return structured JSON
- [x] 4.2 Include per-element: binding details, field_mappings, outgoing/incoming dependencies, constraints
- [x] 4.3 Write Playwright test: create bindings + dependencies + constraints, call export, verify JSON structure
- [x] 4.4 Run test, verify pass, commit: `feat: add API bindings export endpoint with dependencies and constraints`

## 5. PreviewPanel API Binding Mode

- [x] 5.1 Extend PreviewPanel props: add `interactionMode` prop (`'browse' | 'annotate' | 'api-binding'`), replace boolean `annotationMode` usage
- [x] 5.2 Update bridge script (`bridgeScript.ts`): handle `set-api-binding-mode` message with distinct hover style (blue border), handle `show-api-indicators` message to render indicator badges on bound elements
- [x] 5.3 Update WorkspacePage: add mode toggle toolbar (Browse / Annotate / API Binding buttons), wire mode state to PreviewPanel and panels
- [x] 5.4 When API binding mode active and element clicked, dispatch to ApiBindingPanel (next phase) instead of AnnotationEditor
- [x] 5.5 Write Playwright test: open project, toggle to API binding mode, verify hover highlight style changes, verify click dispatches correct event
- [x] 5.6 Run test, verify pass, commit: `feat: add API binding interaction mode to PreviewPanel`

## 6. ApiBindingPanel + ConstraintPanel UI

- [x] 6.1 Create `packages/client/src/components/ApiBindingPanel.tsx` — form with: method dropdown (GET/POST/PUT/DELETE), URL text input, params table (add/remove rows: name, type dropdown, required checkbox), response schema textarea (JSON), field mappings table (add/remove rows: responseField text, targetBridgeId text)
- [x] 6.2 Add dependency section to ApiBindingPanel: outgoing dependencies table (target bridge-id, trigger dropdown, action text), read-only incoming dependencies list
- [x] 6.3 Create `packages/client/src/components/ConstraintPanel.tsx` — form with: constraint_type dropdown, min/max number inputs, pattern text input, required checkbox, error_message text input
- [x] 6.4 Integrate panels into WorkspacePage: show ApiBindingPanel on element click in API binding mode; show ConstraintPanel alongside when clicked element is a form element (input/select/textarea)
- [x] 6.5 Wire save/delete to API routes (POST/PUT/DELETE calls from panels)
- [x] 6.6 Write Playwright test: open project, enter API binding mode, click element, fill binding form, save, verify persisted via GET; click form input, fill constraint, save, verify
- [x] 6.7 Run test, verify pass, commit: `feat: add ApiBindingPanel and ConstraintPanel UI components`

## 7. Constraint Attribute Injection + Generation Prompt

- [x] 7.1 Create `packages/server/src/services/constraintInjector.ts` — function `injectConstraintAttributes(html, constraints)` that parses HTML, finds elements by bridge-id, adds `data-constraint-*` attributes, returns modified HTML
- [x] 7.2 Call injector after constraint save: when a constraint is created/updated, re-inject attributes into the project's stored prototype HTML
- [x] 7.3 Extend `chat.ts` prompt assembly: when project has constraints or analysis_result has inputConstraints, append `=== INPUT CONSTRAINTS ===` block to system prompt
- [x] 7.4 Extend `designSpecAnalyzer` prompt to extract `inputConstraints` array from spec documents (field name, type, min, max, pattern, required)
- [x] 7.5 Write Playwright test: create project with constraints, trigger generation, verify generated HTML contains `data-constraint-*` attributes; upload spec with constraint descriptions, verify analysis extracts inputConstraints
- [x] 7.6 Run test, verify pass, commit: `feat: add constraint attribute injection and constraint-aware generation prompt`

## 8. End-to-End Validation

- [x] 8.1 Full pipeline Playwright test: create project, generate prototype, enter API binding mode, bind an endpoint to a button, add field mapping, add dependency between two dropdowns, add constraint to an input, export — verify export JSON contains all data
- [x] 8.2 Test regeneration warning: verify that after binding exists, regenerating prototype shows appropriate handling
- [x] 8.3 Add `.gitignore` entries for any new test artifacts
- [x] 8.4 Run test, verify pass, commit: `test: validate full API endpoint tagging pipeline end-to-end`
