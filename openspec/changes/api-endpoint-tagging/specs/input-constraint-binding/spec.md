## ADDED Requirements

### Requirement: Click form element to open constraint panel
When the user clicks a form element (input, select, textarea) in API binding mode, the system SHALL show a ConstraintPanel alongside the ApiBindingPanel. The ConstraintPanel allows defining validation rules for the element.

#### Scenario: Click input element
- **WHEN** user clicks an `<input>` element with bridge-id "ping-input" in API binding mode
- **THEN** the ConstraintPanel opens with fields for: constraint type, min, max, pattern, required flag, and error message

#### Scenario: Click non-form element
- **WHEN** user clicks a `<div>` element in API binding mode
- **THEN** only the ApiBindingPanel opens; ConstraintPanel is not shown

### Requirement: Constraint fields
The ConstraintPanel SHALL support the following constraint fields:
- `constraint_type`: dropdown with options (text, number, date, email, phone, custom)
- `min`: numeric input (nullable)
- `max`: numeric input (nullable)
- `pattern`: text input for regex pattern (nullable)
- `required`: checkbox (default false)
- `error_message`: text input for custom error message (nullable)

#### Scenario: Define number constraint
- **WHEN** user sets constraint_type="number", min=0, max=10000, required=true
- **THEN** the constraint is saved with these exact values

#### Scenario: Define text constraint with pattern
- **WHEN** user sets constraint_type="text", pattern="^[A-Z]{2}\\d{4}$", error_message="Format: XX1234"
- **THEN** the constraint is saved with the regex pattern and custom error message

### Requirement: Persist constraints in element_constraints table
The system SHALL store constraints in `element_constraints` table with columns: `id` (UUID), `project_id`, `bridge_id`, `constraint_type` (text), `min` (real, nullable), `max` (real, nullable), `pattern` (text, nullable), `required` (integer 0/1, default 0), `error_message` (text, nullable), `created_at`, `updated_at`.

#### Scenario: DB migration creates table
- **WHEN** server starts and migration has not been applied
- **THEN** the `element_constraints` table is created with all specified columns

### Requirement: CRUD API routes for constraints
The system SHALL expose:
- `GET /api/projects/:id/element-constraints` — list all constraints for project
- `POST /api/projects/:id/element-constraints` — create constraint
- `PUT /api/projects/:id/element-constraints/:constraintId` — update constraint
- `DELETE /api/projects/:id/element-constraints/:constraintId` — delete constraint

#### Scenario: List constraints
- **WHEN** GET is called for a project with 5 constraints
- **THEN** response is a JSON array of 5 constraint objects

#### Scenario: Create constraint with validation
- **WHEN** POST is called without `bridge_id`
- **THEN** response is 400 with error "bridgeId is required"

#### Scenario: Upsert behavior
- **WHEN** POST is called with a bridge_id that already has a constraint
- **THEN** the existing constraint is updated (one constraint per bridge_id)

### Requirement: Constraints included in export
The export endpoint SHALL include element constraints alongside API bindings. Each element in the export that has a constraint includes the full constraint object.

#### Scenario: Export includes constraints
- **WHEN** project has constraint on "ping-input": type=number, min=0, max=10000, required=true
- **THEN** export JSON includes the constraint under the element's entry
