## MODIFIED Requirements

### Requirement: Extract input constraint descriptions from design specs
The design-spec-analysis prompt SHALL be extended to detect and extract input constraint descriptions from design specification documents. When the spec mentions validation rules (e.g., "坪數 field: positive number, range 0-10000", "email format required", "maximum 100 characters"), the analysis output SHALL include an `inputConstraints` array in the structured result.

#### Scenario: Spec with explicit constraint descriptions
- **WHEN** a design spec contains text like "坪數欄位：正整數，範圍 0-10000"
- **THEN** the analysis output includes `inputConstraints: [{ field: "坪數", type: "number", min: 0, max: 10000, required: true }]`

#### Scenario: Spec with multiple constraint types
- **WHEN** a spec describes "email must be valid format" and "phone: 10 digits, starts with 09"
- **THEN** the analysis output includes constraints for both: `[{ field: "email", type: "email" }, { field: "phone", type: "phone", pattern: "^09\\d{8}$" }]`

#### Scenario: Spec with no constraint descriptions
- **WHEN** a design spec contains no validation rule descriptions
- **THEN** the `inputConstraints` array is empty or omitted

### Requirement: Constraint data flows into generation prompt
When the analysis result contains `inputConstraints`, these SHALL be included in the `=== INPUT CONSTRAINTS ===` block of the generation prompt so the AI generates HTML with correct `data-constraint-*` attributes from the start.

#### Scenario: Analyzed constraints appear in generation prompt
- **WHEN** analysis_result contains `inputConstraints` with 2 entries
- **THEN** the generation prompt includes an `=== INPUT CONSTRAINTS ===` block listing both constraints with their field names, types, and rules
- **AND** the AI is instructed to add `data-constraint-*` attributes to matching form elements
