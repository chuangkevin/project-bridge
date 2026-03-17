## MODIFIED Requirements

### Requirement: System prompt instructs valid HTML output
The system SHALL use a system prompt that instructs the AI to generate a single valid HTML file with inline CSS and JS, semantic class names, and `data-bridge-id` attributes on interactive elements. When a design profile exists for the project, the system SHALL append a DESIGN PROFILE block to the system prompt containing the description, reference analysis, and design tokens. The AI MUST follow the design profile.

#### Scenario: Generated output is valid single-file HTML
- **WHEN** AI generates a response
- **THEN** the output SHALL be a complete HTML document with `<!DOCTYPE html>`, inline `<style>` and `<script>` tags, and no external dependencies

#### Scenario: Design profile injected when active
- **WHEN** project has a saved design profile and user sends a chat message
- **THEN** system appends the design profile block to the system prompt before calling OpenAI API

#### Scenario: No design profile — behavior unchanged
- **WHEN** project has no design profile
- **THEN** system uses the base system prompt without any design profile block, same as before
