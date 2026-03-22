## ADDED Requirements

### Requirement: Role-based permission matrix
The system SHALL enforce the following permission matrix based on user role and project ownership:

| Operation | Owner | Other User | Admin |
|-----------|-------|------------|-------|
| View project | YES | YES | YES |
| Annotate | YES | YES | YES |
| Edit design/style | YES | NO | YES |
| Regenerate prototype | YES | NO | YES |
| Page mapping | YES | NO | YES |
| Export code | YES | YES | YES |
| Fork project | - | YES | YES |
| Delete project | YES | NO | YES |
| Manage users | NO | NO | YES |
| Access Settings | NO | NO | YES |

#### Scenario: Owner can do all operations on own project
- **WHEN** a user accesses their own project
- **THEN** all project operations SHALL be available

#### Scenario: Non-owner cannot regenerate
- **WHEN** a non-owner, non-admin user opens another user's project
- **THEN** the regenerate/send chat message button SHALL be disabled
- **AND** edit-mode buttons (style tweaker, visual edit, page-mapping save) SHALL be disabled
- **AND** the API SHALL return 403 for these operations

#### Scenario: Non-owner can view and annotate
- **WHEN** a non-owner user opens another user's project
- **THEN** viewing the prototype, browsing pages, and adding annotations SHALL work normally

#### Scenario: Admin bypasses ownership checks
- **WHEN** an admin user accesses any project
- **THEN** all operations SHALL be available regardless of ownership

### Requirement: API permission middleware
All project mutation endpoints SHALL check user role and project ownership before executing.

#### Scenario: Unauthorized mutation returns 403
- **WHEN** a non-owner, non-admin user calls a mutation endpoint on another's project
- **THEN** the API SHALL return HTTP 403 with error message

#### Scenario: Unauthenticated request returns 401
- **WHEN** an API request has no valid session token
- **THEN** the API SHALL return HTTP 401
