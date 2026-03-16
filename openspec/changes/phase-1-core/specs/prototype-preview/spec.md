## ADDED Requirements

### Requirement: Render prototype in sandboxed iframe
The system SHALL render the AI-generated HTML in a sandboxed iframe using the `srcdoc` attribute with `sandbox="allow-scripts"`.

#### Scenario: Display generated prototype
- **WHEN** AI generation completes and a new PrototypeVersion is stored
- **THEN** system updates the iframe's srcdoc with the new HTML content, rendering the interactive prototype

#### Scenario: Sandbox isolation
- **WHEN** generated HTML contains scripts
- **THEN** scripts execute within the sandbox but MUST NOT access the parent page's DOM, cookies, or storage

### Requirement: Prototype version tracking
The system SHALL store each generated HTML as a PrototypeVersion with an auto-incrementing version number per project, and track which version is current.

#### Scenario: New version created on generation
- **WHEN** AI generates new HTML for a project
- **THEN** system creates a new PrototypeVersion record, sets it as current, and marks the previous version as not current

#### Scenario: Load current version on project open
- **WHEN** user opens a project workspace
- **THEN** system loads and renders the current PrototypeVersion in the iframe

### Requirement: Device size selector
The system SHALL provide a toolbar control to switch the iframe preview between common device sizes.

#### Scenario: Switch to mobile view
- **WHEN** user selects "Mobile" from the device size selector
- **THEN** iframe resizes to 375x667px (iPhone SE equivalent) with visual frame

#### Scenario: Switch to tablet view
- **WHEN** user selects "Tablet" from the device size selector
- **THEN** iframe resizes to 768x1024px (iPad equivalent) with visual frame

#### Scenario: Switch to desktop view
- **WHEN** user selects "Desktop" from the device size selector
- **THEN** iframe uses full available width of the preview area

### Requirement: Empty state
The system SHALL display an empty state in the preview area when a project has no prototype yet.

#### Scenario: New project with no prototype
- **WHEN** user opens a newly created project
- **THEN** preview area shows a placeholder message encouraging the user to describe their UI in the chat panel
