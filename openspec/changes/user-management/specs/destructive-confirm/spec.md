## ADDED Requirements

### Requirement: Destructive operations require name confirmation
All destructive operations SHALL require the user to type the name of the item being deleted as confirmation.

#### Scenario: Delete project confirmation
- **WHEN** user clicks delete on a project
- **THEN** a modal SHALL appear with a red warning message
- **AND** the user MUST type the exact project name to enable the "Delete" button
- **AND** the delete button SHALL remain disabled until the typed text matches

#### Scenario: Delete user confirmation
- **WHEN** admin clicks delete on a user
- **THEN** a modal SHALL appear warning that the user will be permanently removed
- **AND** admin MUST type the user's display name to confirm

#### Scenario: Admin transfer confirmation
- **WHEN** admin initiates admin role transfer
- **THEN** admin MUST type the target user's name to confirm
- **AND** a warning SHALL explain that the current admin will lose admin privileges

#### Scenario: Mismatched input prevents action
- **WHEN** the typed text does not exactly match the required name
- **THEN** the confirm button SHALL remain disabled
- **AND** no API call SHALL be made
