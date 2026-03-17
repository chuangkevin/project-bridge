## ADDED Requirements

### Requirement: Global design profile CRUD
The system SHALL maintain a single global design profile stored in `global_design_profile` table with a fixed ID `'global'`. The profile contains: `description TEXT`, `reference_analysis TEXT`, `tokens TEXT (JSON)`, `updated_at TEXT`.

#### Scenario: GET global design when none exists
- **WHEN** `GET /api/global-design` is called and no global profile exists
- **THEN** system returns `{ "profile": null }` with HTTP 200

#### Scenario: PUT global design creates or updates
- **WHEN** `PUT /api/global-design` is called with `{ description, referenceAnalysis, tokens }`
- **THEN** system upserts the record with fixed ID `'global'` and returns the saved profile

#### Scenario: Global design persists across server restarts
- **WHEN** global design is saved and server restarts
- **THEN** `GET /api/global-design` returns the previously saved profile

### Requirement: Global design supports reference image analysis
The system SHALL allow uploading reference images for the global design profile using the existing analyze-reference endpoint logic.

#### Scenario: Analyze reference image for global design
- **WHEN** `POST /api/global-design/analyze-reference` is called with an image file
- **THEN** system calls Vision API and returns `{ analysis }` (same behavior as project-level endpoint)
