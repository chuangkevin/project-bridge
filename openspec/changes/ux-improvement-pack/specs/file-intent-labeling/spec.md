## ADDED Requirements

### Requirement: User can label uploaded file intent
Each uploaded file SHALL have an optional `intent` field that classifies the file's purpose: `design-spec`, `data-spec`, `brand-guide`, or `reference`. The intent defaults to NULL (unclassified).

#### Scenario: Label file as design spec
- **WHEN** user selects "設計稿" from the intent dropdown on an uploaded file
- **THEN** the system MUST update the file's `intent` to `design-spec` via PATCH request and confirm with success response

#### Scenario: Clear file intent label
- **WHEN** user selects the blank/default option from the intent dropdown
- **THEN** the system MUST set `intent` to NULL for that file

### Requirement: File intent is persisted in database
The `uploaded_files` table SHALL have an `intent TEXT` column (nullable). The value persists across sessions.

#### Scenario: Intent survives page reload
- **WHEN** user labels a file and reloads the page
- **THEN** the intent dropdown MUST still show the previously selected label

### Requirement: File intent is injected into AI prompt with role context
When generating a prototype, the system SHALL inject each file's content with a role preamble based on its `intent` value.

#### Scenario: Design spec intent injection
- **WHEN** a file has `intent = 'design-spec'`
- **THEN** the injected content MUST be prefixed with `[DESIGN SPEC — Treat these colors, layouts, and component styles as requirements. Replicate them exactly.]`

#### Scenario: Data spec intent injection
- **WHEN** a file has `intent = 'data-spec'`
- **THEN** the injected content MUST be prefixed with `[DATA SPEC — Use these data models, field names, and sample values in the prototype content.]`

#### Scenario: Brand guide intent injection
- **WHEN** a file has `intent = 'brand-guide'`
- **THEN** the injected content MUST be prefixed with `[BRAND GUIDE — Apply these brand colors, typography, and tone guidelines throughout the prototype.]`

#### Scenario: Reference intent injection
- **WHEN** a file has `intent = 'reference'`
- **THEN** the injected content MUST be prefixed with `[REFERENCE — Use this as context and inspiration, not as a strict requirement.]`

#### Scenario: Unclassified file injection
- **WHEN** a file has `intent = NULL`
- **THEN** the injected content MUST use the existing generic prefix `[Project design specs (auto-loaded from uploaded files)]`
