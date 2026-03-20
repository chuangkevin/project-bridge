## ADDED Requirements

### Requirement: Constraints rendered as data-constraint-* attributes
When a prototype is generated or constraints are saved, the system SHALL inject `data-constraint-*` attributes onto the corresponding HTML elements. Attributes include: `data-constraint-type`, `data-constraint-min`, `data-constraint-max`, `data-constraint-pattern`, `data-constraint-required`.

#### Scenario: Constraint applied to HTML element
- **WHEN** element "ping-input" has constraint: type=number, min=0, max=10000, required=true
- **THEN** the HTML element with `data-bridge-id="ping-input"` gains attributes: `data-constraint-type="number"` `data-constraint-min="0"` `data-constraint-max="10000"` `data-constraint-required="true"`

#### Scenario: Constraint with regex pattern
- **WHEN** element has constraint: type=text, pattern="^[A-Z]{2}\\d{4}$"
- **THEN** the element gains `data-constraint-type="text"` `data-constraint-pattern="^[A-Z]{2}\d{4}$"`

#### Scenario: Nullable fields omitted
- **WHEN** constraint has min=null, max=null
- **THEN** `data-constraint-min` and `data-constraint-max` attributes are NOT added to the element

### Requirement: Constraints injected into generation prompt
When generating a prototype, if the project has element constraints or the design-spec-analysis extracted input constraints, the system SHALL append an `=== INPUT CONSTRAINTS ===` block to the generation prompt. This block instructs the AI to generate HTML elements with the appropriate `data-constraint-*` attributes.

#### Scenario: Project with constraints generates with constraint block
- **WHEN** a project has 3 element constraints and the user requests prototype generation
- **THEN** the system prompt includes `=== INPUT CONSTRAINTS ===` listing each constrained element with its rules
- **AND** the generated HTML includes matching `data-constraint-*` attributes

#### Scenario: Project without constraints has no constraint block
- **WHEN** a project has no constraints and no spec-extracted constraints
- **THEN** the `=== INPUT CONSTRAINTS ===` block is NOT appended

### Requirement: Constraint attribute injection in HTML post-processor
After prototype generation or when constraints are saved, the system SHALL run a post-processor that injects `data-constraint-*` attributes into the stored HTML for elements that have constraints in the `element_constraints` table.

#### Scenario: Post-processor adds attributes after save
- **WHEN** user saves a constraint for "ping-input" on a project that already has a generated prototype
- **THEN** the stored prototype HTML is updated: the element with `data-bridge-id="ping-input"` gains the corresponding `data-constraint-*` attributes

#### Scenario: Post-processor preserves existing content
- **WHEN** constraint attributes are injected into HTML
- **THEN** all existing attributes, content, and structure of the HTML are preserved unchanged
