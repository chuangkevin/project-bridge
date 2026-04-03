## ADDED Requirements

### Requirement: Project-level inheritance toggle
Each project's design profile SHALL have an `inherit_global INTEGER DEFAULT 1` field and a `supplement TEXT DEFAULT ''` field. When `inherit_global=1`, the project inherits global design. When `inherit_global=0`, only the project's own design is used.

#### Scenario: New project inherits global by default
- **WHEN** a new project is created and has no design profile yet
- **THEN** effective inheritance defaults to true (global design applies if non-empty)

#### Scenario: Toggle inheritance off
- **WHEN** `PUT /api/projects/:id/design` is called with `{ inheritGlobal: false }`
- **THEN** system saves `inherit_global=0` and subsequent generations ignore global design

#### Scenario: Toggle inheritance on
- **WHEN** `PUT /api/projects/:id/design` is called with `{ inheritGlobal: true }`
- **THEN** system saves `inherit_global=1` and subsequent generations include global design

### Requirement: Project supplement field
When `inherit_global=1`, the project MAY specify a `supplement` text that is appended after the global and project design blocks in the generation prompt.

#### Scenario: Save supplement text
- **WHEN** `PUT /api/projects/:id/design` is called with `{ supplement: "此專案按鈕使用橘色強調色" }`
- **THEN** system saves the supplement and returns it in the profile response

#### Scenario: Supplement is empty by default
- **WHEN** a project has no supplement set
- **THEN** `GET /api/projects/:id/design` returns `supplement: ''`

### Requirement: Composed design injection in generation prompt
When generating HTML, the system SHALL compose the system prompt using: global design (if `inherit_global=1` and global is non-empty) → project design (if non-empty) → supplement (if non-empty).

#### Scenario: Both global and project design active
- **WHEN** `inherit_global=1`, global profile has content, and project profile has content
- **THEN** system prompt contains `=== GLOBAL DESIGN ===` block followed by `=== PROJECT DESIGN ===` block, with project tokens overriding conflicting global tokens stated explicitly

#### Scenario: Only global design active (no project design)
- **WHEN** `inherit_global=1`, global profile has content, project profile is empty
- **THEN** system prompt contains only `=== GLOBAL DESIGN ===` block

#### Scenario: Only project design active (inheritance off)
- **WHEN** `inherit_global=0` and project profile has content
- **THEN** system prompt contains only `=== DESIGN PROFILE ===` block (existing behavior)

#### Scenario: Global empty, inheritance on
- **WHEN** `inherit_global=1` but global profile is empty
- **THEN** system prompt omits the global design block entirely (no empty placeholder)

#### Scenario: Supplement appended when present
- **WHEN** `inherit_global=1` and supplement is non-empty
- **THEN** system prompt contains `=== PROJECT SUPPLEMENT ===` block after the design blocks
