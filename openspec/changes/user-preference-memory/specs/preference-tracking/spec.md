## ADDED Requirements

### Requirement: Preference data model extension

The system SHALL extend the existing `user_preferences` table with `confidence` (REAL, default 1.0) and `source` (TEXT, default 'manual') columns to support passive preference learning metadata.

#### Scenario: Existing manual preferences unaffected

- **WHEN** the migration runs on a database with existing `user_preferences` rows
- **THEN** all existing rows SHALL have `confidence = 1.0` and `source = 'manual'`
- **THEN** the existing `/api/users/preferences/:key` API SHALL continue to work unchanged

#### Scenario: Learned preference stored with metadata

- **WHEN** the system observes a user behavior pattern and stores a learned preference
- **THEN** the row SHALL have `source = 'observed'`
- **THEN** the row SHALL have a `confidence` value between 0.0 and 1.0

### Requirement: PreferenceTracker service

The system SHALL provide a `PreferenceTracker` service that passively observes user actions and updates learned preferences in `user_preferences`.

#### Scenario: Track design style from variant selection

- **WHEN** a user selects a generated variant
- **THEN** the system SHALL analyze the variant's visual characteristics (color scheme, layout density, style direction)
- **THEN** the system SHALL update the `pref:design_style` preference for that user
- **THEN** if the observation is consistent with the existing preference, confidence SHALL increase by 0.2 (capped at 1.0)

#### Scenario: Track color preference from micro-adjust

- **WHEN** a user performs a micro-adjust that changes a color property (background-color, color, border-color)
- **THEN** the system SHALL update the `pref:color:{element_type}` preference (e.g., `pref:color:button`, `pref:color:background`)
- **THEN** if the same color is applied again, confidence SHALL increase by 0.2

#### Scenario: Track common pages from chat messages

- **WHEN** a user sends a generation request mentioning specific page names (login, dashboard, settings, contact, etc.)
- **THEN** the system SHALL update the `pref:common_pages` preference with page frequency data
- **THEN** pages mentioned across multiple projects SHALL have higher confidence

#### Scenario: Conflicting observation resets confidence

- **WHEN** a user action produces a preference value that conflicts with the existing stored value
- **THEN** the system SHALL replace the value with the new observation
- **THEN** the confidence SHALL reset to 0.3

#### Scenario: Confidence cap at 1.0

- **WHEN** a consistent observation would increase confidence above 1.0
- **THEN** the confidence SHALL remain at 1.0

### Requirement: Observation hooks in existing flows

The system SHALL hook the PreferenceTracker into existing user action flows without blocking the primary operation.

#### Scenario: Variant selection hook

- **WHEN** a user selects a variant via the existing variant selection endpoint
- **THEN** the system SHALL call `PreferenceTracker.onVariantSelected()` asynchronously (fire-and-forget)
- **THEN** the variant selection response SHALL NOT be delayed by preference tracking

#### Scenario: Micro-adjust hook

- **WHEN** a user completes a micro-adjust action
- **THEN** the system SHALL call `PreferenceTracker.onMicroAdjust()` asynchronously
- **THEN** the micro-adjust response SHALL NOT be delayed

#### Scenario: Chat message hook

- **WHEN** a user sends a chat message that triggers generation
- **THEN** the system SHALL call `PreferenceTracker.onChatMessage()` asynchronously
- **THEN** the generation flow SHALL NOT be delayed by preference tracking

### Requirement: Cross-project preference scope

Learned preferences SHALL be per-user and shared across all projects. They are NOT scoped to a specific project.

#### Scenario: Preference learned in project A applies to project B

- **WHEN** a user develops a design style preference in project A
- **THEN** that preference SHALL be available when generating in project B

#### Scenario: Preferences keyed by user_id only

- **WHEN** a learned preference is stored
- **THEN** the `user_id` and `key` combination SHALL be the unique identifier
- **THEN** no project_id SHALL be part of the preference key
