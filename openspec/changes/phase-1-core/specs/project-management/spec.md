## ADDED Requirements

### Requirement: Create project
The system SHALL allow users to create a new project by providing a project name. The system SHALL generate a unique ID (uuid) and a share token for the project.

#### Scenario: Successful project creation
- **WHEN** user submits a project name via POST `/api/projects`
- **THEN** system creates a project with uuid, share token, and timestamps, and returns the project object

#### Scenario: Empty project name
- **WHEN** user submits an empty project name
- **THEN** system returns a 400 error with message "Project name is required"

### Requirement: List projects
The system SHALL return all projects ordered by last updated time (newest first).

#### Scenario: List projects with existing data
- **WHEN** user requests GET `/api/projects`
- **THEN** system returns an array of all projects with id, name, shareToken, createdAt, updatedAt

#### Scenario: List projects when empty
- **WHEN** user requests GET `/api/projects` and no projects exist
- **THEN** system returns an empty array

### Requirement: Get project detail
The system SHALL return a single project by ID, including its current prototype HTML.

#### Scenario: Get existing project
- **WHEN** user requests GET `/api/projects/:id` with a valid project ID
- **THEN** system returns the project object with current prototype HTML content

#### Scenario: Get non-existent project
- **WHEN** user requests GET `/api/projects/:id` with an invalid ID
- **THEN** system returns a 404 error

### Requirement: Update project
The system SHALL allow updating a project's name.

#### Scenario: Successful update
- **WHEN** user submits PUT `/api/projects/:id` with a new name
- **THEN** system updates the project name and updatedAt timestamp, returns the updated project

### Requirement: Delete project
The system SHALL allow deleting a project and all associated data (conversations, prototype versions).

#### Scenario: Successful deletion
- **WHEN** user submits DELETE `/api/projects/:id`
- **THEN** system deletes the project, all conversations, and all prototype versions, returns 204

#### Scenario: Delete non-existent project
- **WHEN** user submits DELETE `/api/projects/:id` with an invalid ID
- **THEN** system returns a 404 error

### Requirement: Project home page
The system SHALL display a home page with all projects as cards showing name, preview thumbnail, and last modified time.

#### Scenario: View project list
- **WHEN** user navigates to the home page
- **THEN** system displays project cards sorted by last modified time (newest first), each showing project name, a thumbnail preview of the current prototype, and the last modified date

#### Scenario: Create project from home page
- **WHEN** user clicks "New Project" button
- **THEN** system shows a dialog to enter project name, and on submit creates the project and navigates to the workspace
