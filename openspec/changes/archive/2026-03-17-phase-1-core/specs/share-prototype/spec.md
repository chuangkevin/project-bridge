## ADDED Requirements

### Requirement: Generate share link
The system SHALL provide a share button in the project workspace that copies a unique, publicly accessible URL to the clipboard.

#### Scenario: Copy share link
- **WHEN** user clicks the "Share" button in the workspace toolbar
- **THEN** system copies the URL `{base_url}/share/{shareToken}` to clipboard and shows a confirmation toast

### Requirement: Share preview page
The system SHALL serve a read-only preview page at `/share/:shareToken` that displays the current prototype.

#### Scenario: View shared prototype
- **WHEN** someone opens a valid share link
- **THEN** system displays the current prototype in a sandboxed iframe, in read-only mode with no editing controls

#### Scenario: Invalid share token
- **WHEN** someone opens a share link with an invalid token
- **THEN** system displays a "Project not found" error page

### Requirement: Share API endpoint
The system SHALL provide GET `/api/share/:shareToken` that returns the project's current prototype HTML and project name.

#### Scenario: Fetch shared project data
- **WHEN** a GET request is made to `/api/share/:shareToken` with a valid token
- **THEN** system returns the project name and current prototype HTML content

#### Scenario: Invalid token API request
- **WHEN** a GET request is made to `/api/share/:shareToken` with an invalid token
- **THEN** system returns a 404 error

### Requirement: Share page device switching
The system SHALL provide device size switching on the share preview page, matching the workspace preview controls.

#### Scenario: Viewer switches device size
- **WHEN** viewer selects a different device size on the share page
- **THEN** iframe resizes to the selected device dimensions
