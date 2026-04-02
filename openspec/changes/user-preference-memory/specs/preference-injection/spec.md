## ADDED Requirements

### Requirement: Load user preferences for generation

The system SHALL load all learned preferences with `confidence >= 0.6` for the current user before building agent prompts.

#### Scenario: High-confidence preferences loaded

- **WHEN** a generation request is initiated for a user
- **THEN** the system SHALL query `user_preferences` for rows matching the user_id, `source = 'observed'`, and `confidence >= 0.6`
- **THEN** the results SHALL be formatted into a structured preferences block

#### Scenario: No qualifying preferences

- **WHEN** a user has no learned preferences with confidence >= 0.6
- **THEN** the system SHALL NOT inject any preference block into prompts
- **THEN** generation SHALL proceed normally without preference context

#### Scenario: Only manual preferences exist

- **WHEN** a user only has `source = 'manual'` preferences
- **THEN** those preferences SHALL NOT be injected into generation prompts
- **THEN** manual preferences remain accessible via the existing `/api/users/preferences/:key` API

### Requirement: Inject preferences into system prompt

The system SHALL append a `USER PREFERENCES` block to the effective system prompt used for single-page generation (non-parallel path).

#### Scenario: Preferences appended after skills

- **WHEN** the system builds the effective system prompt in the chat route
- **THEN** the preference block SHALL be appended AFTER the agent skills block
- **THEN** the block SHALL use the format:
  ```
  === USER PREFERENCES (learned from past behavior) ===
  - {preference description} (confidence: {score})
  Apply these as defaults unless the user's current request explicitly contradicts them.
  ===================================================
  ```

#### Scenario: User request overrides preferences

- **WHEN** a user explicitly specifies a style or color in their message (e.g., "make it light theme")
- **THEN** the preference block SHALL include the instruction "Apply these as defaults unless the user's current request explicitly contradicts them"
- **THEN** the AI agent SHALL follow the user's explicit request over learned preferences

### Requirement: Inject preferences into master agent prompt

The system SHALL pass user preferences to the master agent (`planGeneration`) so the generation plan reflects user taste.

#### Scenario: Master agent receives preference context

- **WHEN** `planGeneration()` is called for a generation with a logged-in user
- **THEN** the function SHALL receive a `userPreferences` string parameter
- **THEN** the preference context SHALL be included in the master agent's prompt after the design convention section

#### Scenario: Master agent applies design style preference

- **GIVEN** a user has `pref:design_style = "dark"` with confidence 0.8
- **WHEN** the master agent plans a generation
- **THEN** the plan's shared CSS and design direction SHALL default to dark theme unless the user's prompt specifies otherwise

### Requirement: Inject preferences into sub-agent prompts

The system SHALL pass user preferences to sub-agents (`generatePageFragment`) so individual page generation reflects user taste.

#### Scenario: Sub-agent receives preference context

- **WHEN** `generatePageFragment()` is called for each page
- **THEN** the function SHALL receive a `userPreferences` string parameter
- **THEN** the preference context SHALL be included in the sub-agent's system prompt

#### Scenario: Color preferences applied to sub-agent output

- **GIVEN** a user has `pref:color:button = "#e63946"` with confidence 0.7
- **WHEN** a sub-agent generates a page with buttons
- **THEN** the sub-agent SHALL default to using the preferred button color unless design tokens or explicit instructions specify otherwise

### Requirement: Inject preferences into micro-adjust prompts

The system SHALL include user preferences in micro-adjust prompt context so adjustments align with user patterns.

#### Scenario: Micro-adjust respects color preferences

- **GIVEN** a user has `pref:color:background = "#1a1a2e"` with confidence 0.8
- **WHEN** the user requests a micro-adjust that involves color changes
- **THEN** the system SHALL include the preference in the micro-adjust prompt as context
- **THEN** the AI SHALL use the preferred color as a default when the user's request is ambiguous (e.g., "make it darker")

### Requirement: Preference formatting

The system SHALL format preferences into a human-readable block suitable for LLM consumption.

#### Scenario: Design style preference formatting

- **GIVEN** `pref:design_style = "dark, minimalist"` with confidence 0.8
- **THEN** the formatted line SHALL be: `- Design style: dark, minimalist (confidence: 0.8)`

#### Scenario: Color preference formatting

- **GIVEN** `pref:color:button = "#e63946"` with confidence 0.7
- **THEN** the formatted line SHALL be: `- Preferred button color: #e63946 (confidence: 0.7)`

#### Scenario: Common pages preference formatting

- **GIVEN** `pref:common_pages = ["login","dashboard","settings"]` with confidence 0.9
- **THEN** the formatted line SHALL be: `- Frequently requested pages: login, dashboard, settings (confidence: 0.9)`
