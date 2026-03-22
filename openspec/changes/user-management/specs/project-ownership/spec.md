## ADDED Requirements

### Requirement: Project has an owner
Every project SHALL have an `owner_id` field referencing the user who created it.

#### Scenario: New project gets owner
- **WHEN** a user creates a new project
- **THEN** the project's `owner_id` SHALL be set to the creating user's ID

#### Scenario: Existing projects assigned to admin
- **WHEN** the user system is first initialized (migration)
- **THEN** all existing projects without an owner SHALL be assigned to the admin user

### Requirement: Owner displayed on project card
The home page project cards SHALL display the owner's display name.

#### Scenario: Project card shows owner
- **WHEN** user views the home page
- **THEN** each project card SHALL show the owner's name below the project name

### Requirement: Home page split by ownership
The home page SHALL split projects into two sections: "My Projects" and "Others' Projects".

#### Scenario: User sees own projects first
- **WHEN** a logged-in user views the home page
- **THEN** projects owned by them SHALL appear in a "My Projects" section at the top
- **AND** projects owned by others SHALL appear in an "Others' Projects" section below

#### Scenario: Admin sees all projects
- **WHEN** an admin views the home page
- **THEN** the same two-section layout SHALL be used
- **AND** admin's own projects appear in "My Projects", others in "Others' Projects"
