## ADDED Requirements

### Requirement: Display design tokens in an editable UI
The system SHALL show the project's compiled design tokens in a visual editor grouped by category (Colors, Typography, Spacing, Components).

#### Scenario: View compiled tokens
- **WHEN** user navigates to the project's design token section
- **THEN** UI displays color swatches for all color tokens, font previews for typography, and numeric inputs for spacing/sizing values

#### Scenario: No tokens compiled yet
- **WHEN** project has no design_tokens data
- **THEN** UI shows an empty state with a "Compile Tokens" button and instructions to add reference images, specs, or URLs

### Requirement: Edit individual token values
The system SHALL allow users to manually override any token value. Manual overrides have the highest priority (above reference images).

#### Scenario: User changes primary color
- **WHEN** user edits `colors.primary` from `#8E6FA7` to `#FF6600`
- **THEN** token is updated immediately in the UI and saved to DB on confirm
- **AND** the token is marked as `manualOverride: true` so future recompilation preserves it

#### Scenario: User resets a manually overridden token
- **WHEN** user clicks "Reset" on a manually overridden token
- **THEN** the manual override is removed and the value reverts to the compiled value from source priority chain

### Requirement: Add reference URL for crawling
The system SHALL provide a URL input field where users can paste a website URL and trigger crawling directly from the token editor.

#### Scenario: User adds a reference URL
- **WHEN** user pastes `https://example.com` and clicks "Extract Styles"
- **THEN** system crawls the URL, shows a loading indicator, and on completion updates the token preview with extracted values

### Requirement: Preview tokens before applying
The system SHALL show a live preview of how the tokens would look when applied (mini preview with sample components using the token colors/fonts).

#### Scenario: User changes a color token
- **WHEN** user modifies `colors.primary`
- **THEN** the preview panel updates in real-time showing buttons, cards, and text in the new color
