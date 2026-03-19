## MODIFIED Requirements

### Requirement: Convention color override injection
The system SHALL inject a CSS override block after the AI-generated `<style>` tag that force-sets `:root` custom properties from the active design convention. This ensures convention colors are always applied regardless of what the AI generated.

#### Scenario: Convention colors injected as override
- **WHEN** project has HousePrice color convention with `c-purple-600: #8E6FA7`
- **THEN** the output HTML contains a final `<style>` block in `<head>` with `:root { --primary: #8E6FA7; }` that overrides any AI-set value

#### Scenario: No convention — no override injected
- **WHEN** project has no design convention configured
- **THEN** no color override block is added to the HTML

#### Scenario: Override does not duplicate existing correct values
- **WHEN** AI already correctly set `--primary: #8E6FA7` in its generated CSS
- **THEN** the override block is still injected (idempotent — same value, no visual difference)
