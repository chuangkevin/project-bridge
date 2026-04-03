# Spec: arch-version-restore

Restore a previous architecture version, replacing current `arch_data` safely.

## Requirements

### R1: Restore replaces current arch_data

- **WHEN** the user confirms restoring a specific version
- **THEN** the current `arch_data` in the `projects` table is replaced with the `arch_data` from the selected version
- **AND** the ArchFlowchart UI updates to reflect the restored nodes and edges immediately

### R2: Safety snapshot before restore

- **WHEN** a restore operation is initiated
- **THEN** the server first saves the **current** `arch_data` as a new version with description `"Pre-restore snapshot"`
- **AND** this safety version is created before the `projects.arch_data` is overwritten
- **AND** the safety version's ID is returned in the restore response

### R3: Confirmation dialog

- **WHEN** the user clicks "Restore" / "還原" on a version entry
- **THEN** a confirmation dialog is displayed with a message like "確定要還原到版本 v12 嗎？目前的架構將自動儲存為新版本。"
- **AND** the dialog has "Confirm" / "確認" and "Cancel" / "取消" buttons
- **AND** the restore only proceeds if the user confirms

### R4: Cancel restore

- **WHEN** the user clicks "Cancel" in the confirmation dialog
- **THEN** no restore is performed
- **AND** the current `arch_data` remains unchanged
- **AND** no safety snapshot is created

### R5: Restore API call

- **WHEN** the user confirms the restore
- **THEN** the client calls `POST /api/projects/:id/architecture/versions/:versionId/restore`
- **AND** the response contains the restored `arch_data` and the `safety_version_id`

### R6: UI refresh after restore

- **WHEN** the restore completes successfully
- **THEN** the ArchFlowchart re-renders with the restored nodes and edges
- **AND** the version history panel refreshes to show the new safety snapshot version
- **AND** a success notification is shown to the user

### R7: Restore error handling

- **WHEN** the restore API call fails
- **THEN** no changes are made to the current `arch_data`
- **AND** an error message is displayed to the user
