## ADDED Requirements

### Requirement: User login by name selection
The system SHALL present a login screen listing all active users. Users SHALL log in by clicking their name without entering a password.

#### Scenario: First-ever access shows setup
- **WHEN** no users exist in the system
- **THEN** system SHALL display a "Create Admin" form with a name input
- **AND** the created user SHALL be assigned the `admin` role

#### Scenario: Login screen with existing users
- **WHEN** users exist in the system
- **THEN** system SHALL display a list of all active (non-disabled) users
- **AND** clicking a user name SHALL create a session and redirect to the home page

#### Scenario: Disabled users not shown
- **WHEN** a user has been disabled by an admin
- **THEN** that user SHALL NOT appear in the login screen

### Requirement: Session management
The system SHALL maintain user sessions to track the currently logged-in user across requests.

#### Scenario: Session creation on login
- **WHEN** a user selects their name on the login screen
- **THEN** system SHALL create a session token stored in the browser (cookie or localStorage)
- **AND** all subsequent API requests SHALL include this token

#### Scenario: Session identifies user
- **WHEN** an API request includes a valid session token
- **THEN** the server SHALL resolve the associated user ID and role

#### Scenario: Logout
- **WHEN** user clicks logout
- **THEN** session SHALL be invalidated and user SHALL be redirected to login screen

### Requirement: First user is admin
The system SHALL assign the `admin` role to the first user ever created. All subsequent users created by admin SHALL have the `user` role.

#### Scenario: First user setup
- **WHEN** the system has zero users
- **THEN** the first user created SHALL automatically receive the `admin` role

### Requirement: Admin transfer
An admin SHALL be able to transfer the admin role to another user.

#### Scenario: Transfer admin role
- **WHEN** admin selects "Transfer Admin" and picks another user
- **THEN** the target user SHALL become admin
- **AND** the original user SHALL become a regular user
- **AND** this SHALL require GitHub-style confirmation (type target user's name)
