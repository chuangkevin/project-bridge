## ADDED Requirements

### Requirement: Fork creates a copy of another user's project
Users SHALL be able to fork any project they can view. The fork SHALL create an independent copy owned by the forking user.

#### Scenario: Fork copies core data
- **WHEN** user clicks "Fork" on another user's project
- **THEN** system SHALL create a new project with:
  - Name: "原始名稱 (fork)"
  - Owner: the forking user
  - HTML prototype: copied from the latest version
  - Architecture data: copied
  - Page element mappings: copied (with new IDs)
- **AND** the fork SHALL NOT copy: annotations, conversation history, design profile

#### Scenario: Fork appears in user's projects
- **WHEN** a fork is created
- **THEN** the forked project SHALL appear in the user's "My Projects" section
- **AND** changes to the fork SHALL NOT affect the original project

#### Scenario: Fork button visibility
- **WHEN** a user views a project they do not own
- **THEN** a "Fork" button SHALL be visible in the toolbar
- **WHEN** a user views their own project
- **THEN** the "Fork" button SHALL NOT be shown

### Requirement: Fork API endpoint
The system SHALL provide a POST endpoint to fork a project.

#### Scenario: Successful fork via API
- **WHEN** POST /api/projects/:id/fork is called with a valid session
- **THEN** a new project SHALL be created with copied data
- **AND** the response SHALL include the new project's ID and redirect URL
