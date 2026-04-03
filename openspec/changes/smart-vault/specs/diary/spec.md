## ADDED Requirements

### Requirement: Create diary entry
The system SHALL allow creating one diary entry per date, with title and markdown content.

#### Scenario: Create a new diary entry
- **WHEN** user submits a diary entry for 2026-04-03 with title and content
- **THEN** system stores the entry and indexes it in FTS5 for search

#### Scenario: Duplicate date entry
- **WHEN** user creates an entry for a date that already has an entry
- **THEN** system returns HTTP 409 conflict with message to use update instead

### Requirement: Update diary entry
The system SHALL allow updating the title and content of an existing diary entry.

#### Scenario: Update existing entry
- **WHEN** user updates the content of a diary entry
- **THEN** system saves the changes, updates the FTS5 index, and records updated_at timestamp

### Requirement: List diary entries
The system SHALL provide an API to list diary entries with pagination, sorted by date (newest first).

#### Scenario: List recent entries
- **WHEN** user requests diary list with limit=30
- **THEN** system returns the 30 most recent diary entries with date, title, and content preview (first 100 characters)

#### Scenario: Filter by date range
- **WHEN** user requests entries between 2026-03-01 and 2026-03-31
- **THEN** system returns only entries within that date range

### Requirement: View diary entry
The system SHALL provide an API to retrieve a single diary entry by date.

#### Scenario: View entry by date
- **WHEN** user requests the diary entry for 2026-04-03
- **THEN** system returns the full entry with title, content, created_at, and updated_at

#### Scenario: View non-existent date
- **WHEN** user requests an entry for a date with no entry
- **THEN** system returns HTTP 404

### Requirement: Delete diary entry
The system SHALL allow deleting a diary entry by date.

#### Scenario: Delete entry
- **WHEN** user deletes the diary entry for a specific date
- **THEN** system removes the entry and its FTS5 index record

### Requirement: Diary calendar view data
The system SHALL provide an API to return which dates have diary entries for a given month.

#### Scenario: Get month overview
- **WHEN** user requests diary dates for 2026-04
- **THEN** system returns an array of dates that have entries in that month (e.g., ["2026-04-01", "2026-04-03"])
