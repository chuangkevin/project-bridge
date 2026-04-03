## ADDED Requirements

### Requirement: Select all / deselect all
The system SHALL provide a checkbox in the skills table header that toggles selection of all visible skills.

#### Scenario: Select all
- **WHEN** user clicks the header checkbox when no skills are selected
- **THEN** all skills become selected and the batch action bar appears

#### Scenario: Deselect all
- **WHEN** user clicks the header checkbox when all skills are selected
- **THEN** all skills become deselected and the batch action bar disappears

### Requirement: Individual skill selection
The system SHALL provide a checkbox on each skill row for individual selection.

#### Scenario: Select individual skills
- **WHEN** user checks 3 out of 10 skill checkboxes
- **THEN** those 3 skills are selected, batch action bar shows "(3 已選)", and the header checkbox shows indeterminate state

### Requirement: Batch action bar
The system SHALL display a floating action bar at the bottom of the skills section when one or more skills are selected, with buttons for "啟用", "停用", and "刪除".

#### Scenario: Batch enable
- **WHEN** user selects 5 disabled skills and clicks "啟用 (5)"
- **THEN** the system calls `POST /api/skills/batch-action` with `{ ids: [...], action: 'enable' }`, all 5 skills become enabled, and the skills list refreshes

#### Scenario: Batch disable
- **WHEN** user selects 3 enabled skills and clicks "停用 (3)"
- **THEN** the system calls `POST /api/skills/batch-action` with `{ ids: [...], action: 'disable' }`, all 3 skills become disabled

#### Scenario: Batch delete with confirmation
- **WHEN** user selects 4 skills and clicks "刪除 (4)"
- **THEN** the system shows a confirmation dialog "確定刪除 4 個技能？此操作無法復原。" and on confirm, calls `POST /api/skills/batch-action` with `{ ids: [...], action: 'delete' }`

### Requirement: Batch action API
The `POST /api/skills/batch-action` endpoint SHALL accept `{ ids: string[], action: 'enable' | 'disable' | 'delete' }` and perform the operation on all specified skills.

#### Scenario: Batch action with admin auth
- **WHEN** an authenticated admin sends a valid batch action request
- **THEN** the API performs the operation and returns the updated skills list

#### Scenario: Non-admin batch action
- **WHEN** a non-admin user sends a batch action request
- **THEN** the API returns 401 Unauthorized
