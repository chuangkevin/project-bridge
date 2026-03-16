## ADDED Requirements

### Requirement: Structured constraints bar in chat panel
The system SHALL display a collapsible constraints bar above the chat input with options for device type, color scheme, and language.

#### Scenario: Set device constraint
- **WHEN** PM selects "Mobile" in the device constraint dropdown
- **THEN** system includes "Target device: mobile (375x667)" in the AI system prompt for the next generation

#### Scenario: Set color scheme
- **WHEN** PM selects "Dark" in the color scheme dropdown
- **THEN** system includes "Color scheme: dark mode with dark backgrounds and light text" in the AI system prompt

#### Scenario: Set custom color
- **WHEN** PM selects "Custom" and enters hex color "#FF6B00"
- **THEN** system includes "Primary brand color: #FF6B00" in the AI system prompt

#### Scenario: Set language
- **WHEN** PM selects "繁體中文" in the language dropdown
- **THEN** system includes "Generate all UI text in Traditional Chinese (zh-TW)" in the AI system prompt

#### Scenario: Constraints persist per project
- **WHEN** PM sets constraints and navigates away, then returns
- **THEN** constraints are preserved (stored in project metadata or local storage)

### Requirement: Constraints injection into prompt
The system SHALL append active constraints to the system prompt as additional instructions before calling the AI.

#### Scenario: Multiple constraints active
- **WHEN** PM has set device=mobile, color=dark, language=zh-TW
- **THEN** system appends all three constraints to the system prompt in the next AI call
