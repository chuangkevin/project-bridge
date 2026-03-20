# Spec: arch-version-history-ui

UI panel displaying version history with timestamps and descriptions.

## Requirements

### R1: Version history toggle

- **WHEN** the user clicks the "Version History" / "版本紀錄" button in the ArchFlowchart toolbar
- **THEN** a version history panel is displayed (side panel or dropdown)
- **AND** clicking the button again closes the panel

### R2: Version list display

- **WHEN** the version history panel is open
- **THEN** it shows a scrollable list of all saved versions for the current project
- **AND** versions are ordered newest-first (highest version number at the top)

### R3: Version entry content

- **WHEN** a version entry is displayed in the list
- **THEN** it shows:
  - The version number (e.g. "v12")
  - The description text (e.g. "Added page: Login")
  - A relative timestamp (e.g. "3 minutes ago")
- **AND** hovering over the timestamp shows the full ISO datetime

### R4: Current version indicator

- **WHEN** the version list is displayed
- **THEN** the most recent version (highest version number) is visually marked as "current"
- **AND** the indicator distinguishes it clearly from older versions (e.g. highlighted background, "current" badge)

### R5: Empty state

- **WHEN** the version history panel is opened and no versions exist for the project
- **THEN** a message is displayed indicating no version history is available yet (e.g. "尚無版本紀錄")

### R6: Version list loading

- **WHEN** the version history panel is opened
- **THEN** the version list is fetched from `GET /api/projects/:id/architecture/versions`
- **AND** a loading indicator is shown while the request is in progress

### R7: Restore button per version

- **WHEN** a version entry is displayed (and it is not the current version)
- **THEN** a "Restore" / "還原" button is shown for that version
- **AND** the current version does not show a restore button (it is already active)
