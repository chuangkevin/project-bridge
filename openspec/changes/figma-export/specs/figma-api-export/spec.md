## ADDED Requirements

### Requirement: API export via code.to.design
The system SHALL support exporting prototypes to Figma clipboard data via the code.to.design API when an API key is configured.

#### Scenario: Successful API export
- **WHEN** user clicks "匯出到剪貼簿" with a valid code.to.design API key configured
- **AND** selects a viewport (desktop/tablet/mobile)
- **THEN** the system SHALL call code.to.design API with the prototype HTML
- **AND** copy the returned Figma clipboard data to the user's clipboard
- **AND** show "已複製！在 Figma 中按 Ctrl+V 貼上" confirmation

#### Scenario: Multi-page export
- **WHEN** prototype has multiple pages
- **THEN** the system SHALL use the `html-multi` endpoint to export all pages side-by-side in Figma

#### Scenario: Viewport selection
- **WHEN** user selects "Desktop" viewport
- **THEN** the API SHALL be called with width 1440
- **WHEN** user selects "Tablet"
- **THEN** width 768
- **WHEN** user selects "Mobile"
- **THEN** width 390

### Requirement: API key management for code.to.design
The settings page SHALL allow configuring a code.to.design API key.

#### Scenario: Save API key
- **WHEN** admin enters a code.to.design API key in settings
- **THEN** the key SHALL be stored in the settings table as `code_to_design_api_key`

#### Scenario: No API key configured
- **WHEN** no code.to.design API key is configured
- **THEN** the API export section in the dialog SHALL be disabled
- **AND** a message SHALL prompt the user to configure the key in settings

### Requirement: Server export endpoint
The server SHALL provide `POST /api/projects/:id/export/figma` that proxies the code.to.design API call.

#### Scenario: Export endpoint returns clipboard data
- **WHEN** POST request is made with `{ viewport: 'desktop' }`
- **THEN** server SHALL call code.to.design API and return `{ clipboardData: '...' }`

#### Scenario: API error handling
- **WHEN** code.to.design API returns an error (rate limit, invalid key, etc.)
- **THEN** server SHALL return a user-friendly error message
