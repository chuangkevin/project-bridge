## ADDED Requirements

### Requirement: Project has configurable generation temperature
Each project SHALL have a `generation_temperature` setting (REAL, default 0.3, range 0.0–1.0). The value is sent to OpenAI as the `temperature` parameter on every generation request for that project.

#### Scenario: Default temperature is 0.3
- **WHEN** a new project is created
- **THEN** its `generation_temperature` MUST default to 0.3

#### Scenario: User changes temperature via slider
- **WHEN** user adjusts the temperature slider in ChatPanel advanced settings
- **THEN** the system MUST save the new value to the project and use it on the next generation

#### Scenario: Temperature is applied to OpenAI call
- **WHEN** a generation request is made
- **THEN** the OpenAI `chat.completions.create` call MUST include `temperature: project.generation_temperature`

### Requirement: Project has a seed prompt
Each project SHALL support a `seed_prompt TEXT` field (nullable). When set, the seed prompt is prepended to the user message on every generation request, providing a consistent starting context.

#### Scenario: Seed prompt prepended to user message
- **WHEN** a project has a non-empty `seed_prompt` and a generation is triggered
- **THEN** the user message sent to OpenAI MUST start with `[Generation Seed]\n${seedPrompt}\n\n` followed by the original user message

#### Scenario: Empty seed prompt has no effect
- **WHEN** a project's `seed_prompt` is NULL or empty string
- **THEN** the user message MUST NOT be modified by seed prompt logic

#### Scenario: User can set seed prompt in ChatPanel
- **WHEN** user types in the seed prompt field and saves
- **THEN** the system MUST persist the seed prompt to the project via API

### Requirement: Color deviation warning after generation
After a prototype is generated, the system SHALL compare the generated HTML's dominant colors against the design spec's primary color (from `visual_analysis`). If the color distance exceeds a threshold, a warning badge SHALL be displayed.

#### Scenario: Warning shown when colors diverge
- **WHEN** the generated HTML has dominant colors that differ from the design spec primary color by more than RGB distance 80
- **THEN** the PreviewPanel MUST show a warning badge: "色彩偏差" with the detected primary color swatch

#### Scenario: No warning when colors match
- **WHEN** the generated HTML dominant colors are within RGB distance 80 of the design spec primary color
- **THEN** no color deviation badge is shown

#### Scenario: No warning when no design spec exists
- **WHEN** the project has no uploaded file with `visual_analysis`
- **THEN** no color deviation badge is shown
