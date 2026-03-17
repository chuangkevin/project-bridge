## ADDED Requirements

### Requirement: Spec panel displays structured specification
The system SHALL display a spec panel on the right side of the workspace. When PM clicks an annotated element, the panel shows structured specification fields.

#### Scenario: View element spec
- **WHEN** PM clicks an annotated element in the prototype
- **THEN** spec panel shows editable fields: field name, field type, constraints (min/max/pattern), API endpoint (method + path), validation rules, and business logic notes

#### Scenario: Save spec data
- **WHEN** PM fills in spec fields and clicks save
- **THEN** system updates the annotation's `specData` JSON via PUT `/api/projects/:id/annotations/:aid`

### Requirement: Spec panel toggle
The system SHALL allow toggling the right panel between annotation list view and spec detail view.

#### Scenario: Toggle to annotation list
- **WHEN** PM clicks "Annotations" tab in the right panel
- **THEN** system shows the list of all annotations

#### Scenario: Toggle to spec detail
- **WHEN** PM clicks an element or selects "Spec" tab
- **THEN** system shows the structured spec form for the selected element

### Requirement: Spec data in share page
The system SHALL display annotation indicators and spec data on the share preview page in read-only mode.

#### Scenario: Viewer sees annotations on shared prototype
- **WHEN** viewer opens a shared prototype that has annotations
- **THEN** system displays annotation indicators, and clicking an indicator shows the annotation content and spec data in a read-only tooltip/popover
