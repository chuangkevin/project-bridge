## ADDED Requirements

### Requirement: Admin can manage users
Admin SHALL have access to a user management panel to create, disable, and delete users.

#### Scenario: Create new user
- **WHEN** admin enters a display name and clicks "Create"
- **THEN** a new user with `user` role SHALL be created
- **AND** the user SHALL appear in the login screen

#### Scenario: Disable user
- **WHEN** admin clicks "Disable" on a user
- **THEN** the user SHALL be marked as disabled
- **AND** the user SHALL NOT appear in the login screen
- **AND** any active sessions for that user SHALL be invalidated

#### Scenario: Delete user
- **WHEN** admin clicks "Delete" on a user
- **THEN** system SHALL require GitHub-style confirmation (type user's name)
- **AND** the user record SHALL be removed
- **AND** the user's projects SHALL remain but become unowned (assigned to admin)

#### Scenario: Admin cannot delete themselves
- **WHEN** admin tries to delete their own account
- **THEN** system SHALL prevent the action with an error message

### Requirement: User management accessible from Settings
The user management panel SHALL be accessible from the Settings page, visible only to admin users.

#### Scenario: Admin sees user management
- **WHEN** admin navigates to Settings
- **THEN** a "User Management" section SHALL be visible

#### Scenario: Non-admin cannot access user management
- **WHEN** a non-admin user tries to access /api/users endpoints
- **THEN** the API SHALL return 403
