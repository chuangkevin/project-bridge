## ADDED Requirements

### Requirement: Design profile CRUD
The system SHALL maintain one design profile per project. GET `/api/projects/:id/design` returns the profile or null. PUT `/api/projects/:id/design` upserts it.

#### Scenario: Get design profile (exists)
- **WHEN** GET `/api/projects/:id/design` and profile exists
- **THEN** system returns the design profile with description, referenceAnalysis, tokens (JSON), and updatedAt

#### Scenario: Get design profile (not exists)
- **WHEN** GET `/api/projects/:id/design` and no profile exists
- **THEN** system returns `{ profile: null }`

#### Scenario: Save design profile
- **WHEN** PUT `/api/projects/:id/design` with description, tokens, and optional referenceAnalysis
- **THEN** system upserts the profile, returns the saved profile

### Requirement: Analyze visual reference image
The system SHALL accept an image upload via POST `/api/projects/:id/design/analyze-reference`, send it to OpenAI Vision API (gpt-4o), and return a design analysis.

#### Scenario: Successful analysis
- **WHEN** designer uploads a valid image (png/jpg, max 10MB)
- **THEN** system sends image as base64 to gpt-4o vision, returns analysis text describing color palette, typography style, spacing, border radius, shadow, and overall aesthetic

#### Scenario: Analysis failure
- **WHEN** OpenAI Vision API returns an error
- **THEN** system returns 500 with message "Could not analyze image"

### Requirement: Design tab in workspace left panel
The system SHALL show two tabs in the workspace left panel: "Chat" and "Design". The Design tab contains the full design profile UI.

#### Scenario: Switch to Design tab
- **WHEN** user clicks "Design" tab
- **THEN** system shows the design profile form with description, reference image upload, and design tokens

#### Scenario: Design profile persists across sessions
- **WHEN** user fills and saves design profile, then reloads the page
- **THEN** design profile values are restored from the server

### Requirement: Design profile form
The system SHALL provide a form with: multi-line text description, reference image upload (max 5 images) with Vision analysis display, and design tokens (primary color, secondary color, font family, border radius slider 0-24px, spacing density radio, shadow style radio).

#### Scenario: Upload reference image and see analysis
- **WHEN** designer uploads a reference image
- **THEN** system shows a loading state, then displays the Vision analysis text below the image thumbnail

#### Scenario: Save design tokens
- **WHEN** designer sets primaryColor="#3b82f6", borderRadius=8, spacing="normal" and clicks save
- **THEN** system saves the profile and shows "已儲存，下次生成將套用此設計"

### Requirement: Design profile indicator in toolbar
The system SHALL show a visual indicator in the workspace toolbar when a design profile is active.

#### Scenario: Profile active indicator
- **WHEN** project has a saved design profile with any content
- **THEN** toolbar shows a "Design Active" badge near the generate area
